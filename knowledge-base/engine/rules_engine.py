"""
Motor de regras de referência da base de conhecimento.

Lê as diretivas (directives/*.yaml), avalia contra a telemetria + baseline do astronauta e
gera alertas no formato de schema/alert.schema.json. Determinístico e auditável: cada alerta
traz a evidência numérica de cada condição avaliada.

Uso:
    pip install pyyaml
    python engine/rules_engine.py                       # usa examples/
    python engine/rules_engine.py --telemetry t.json --profile p.json --json
"""
import argparse
import json
import operator
import sys
import uuid
from datetime import datetime, timedelta
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover
    sys.exit("Dependência ausente: rode `pip install pyyaml`")

KB_ROOT = Path(__file__).resolve().parent.parent
LEVELS = ["atencao", "alerta", "critico"]
LEVEL_RANK = {lvl: i for i, lvl in enumerate(LEVELS)}
OPS = {">": operator.gt, ">=": operator.ge, "<": operator.lt, "<=": operator.le, "==": operator.eq}
CASE_OPENING_LEVELS = {"alerta", "critico"}


# ── utilidades ──────────────────────────────────────────────────────────────

def parse_window(text):
    if not text:
        return None
    unit = text[-1]
    amount = float(text[:-1])
    return {"m": timedelta(minutes=amount), "h": timedelta(hours=amount), "d": timedelta(days=amount)}[unit]


def parse_ts(text):
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


def get_path(sample, dotted):
    node = sample
    for key in dotted.split("."):
        if not isinstance(node, dict) or key not in node:
            return None
        node = node[key]
    return node


def load_directives(directory=None):
    directory = Path(directory or KB_ROOT / "directives")
    directives = []
    for path in sorted(directory.glob("*.yaml")):
        if path.name.startswith("_"):
            continue
        with path.open(encoding="utf-8") as fh:
            directives.append(yaml.safe_load(fh))
    return directives


# ── avaliação ───────────────────────────────────────────────────────────────

class Evaluator:
    def __init__(self, samples, baseline, now=None):
        self.samples = sorted(samples, key=lambda s: s["_ts"])
        self.baseline = baseline or {}
        self.now = now or (self.samples[-1]["_ts"] if self.samples else datetime.utcnow())

    def _in_window(self, window):
        if window is None:
            return self.samples
        start = self.now - window
        return [s for s in self.samples if start <= s["_ts"] <= self.now]

    def _aggregate(self, metric, agg, window_text):
        window = parse_window(window_text)
        samples = self._in_window(window)
        values = [v for v in (get_path(s, metric) for s in samples) if v is not None]
        if agg == "count":
            return len(values)
        if not values:
            return None
        if window is None or agg == "last":
            return values[-1]
        if agg == "mean":
            return sum(values) / len(values)
        if agg == "max":
            return max(values)
        if agg == "min":
            return min(values)
        if agg == "sum":
            return sum(values)
        if agg == "delta":
            return values[-1] - values[0]
        raise ValueError("agregação desconhecida: %s" % agg)

    def evaluate(self, cond):
        """Retorna (bool, [evidências])."""
        if "all" in cond:
            results = [self.evaluate(c) for c in cond["all"]]
            return all(r[0] for r in results), [e for r in results for e in r[1]]
        if "any" in cond:
            results = [self.evaluate(c) for c in cond["any"]]
            hits = [r for r in results if r[0]]
            chosen = hits if hits else results
            return bool(hits), [e for r in chosen for e in r[1]]
        if "symptoms_any" in cond:
            wanted = set(cond["symptoms_any"])
            seen = set()
            for s in self._in_window(parse_window(cond.get("window"))):
                seen.update(s.get("symptoms") or [])
            found = sorted(wanted & seen)
            return bool(found), [{"symptoms_any": sorted(wanted), "window": cond.get("window"), "observed": found}]
        return self._evaluate_metric(cond)

    def _evaluate_metric(self, cond):
        metric, agg = cond["metric"], cond.get("agg", "last")
        observed = self._aggregate(metric, agg, cond.get("window"))
        evidence = {
            "metric": metric, "agg": agg, "window": cond.get("window"),
            "op": cond["op"], "threshold": cond["value"],
        }
        if observed is not None and cond.get("relative_to") == "baseline":
            base = self.baseline.get(metric)
            evidence.update(relative_to="baseline", baseline=base, raw=round(observed, 3))
            if not base:
                evidence["observed"] = None
                evidence["note"] = "sem baseline"
                return False, [evidence]
            observed = (observed - base) / base * 100.0
        evidence["observed"] = round(observed, 3) if isinstance(observed, float) else observed
        if observed is None:
            evidence["note"] = "sem dados na janela"
            return False, [evidence]
        return OPS[cond["op"]](observed, cond["value"]), [evidence]


def evaluate_directive(directive, evaluator, astronaut_id):
    fired = []
    for trig in directive.get("triggers", []):
        ok, evidence = evaluator.evaluate(trig["when"])
        if ok:
            fired.append({"id": trig["id"], "level": trig["level"],
                          "description": trig.get("description", ""), "evidence": evidence})
    if not fired:
        return None

    level = max((t["level"] for t in fired), key=LEVEL_RANK.get)
    esc = directive.get("escalation", {})

    def at_or_above(key):
        threshold = esc.get(key)
        return threshold is not None and LEVEL_RANK[level] >= LEVEL_RANK[threshold]

    return {
        "alert_id": str(uuid.uuid4()),
        "astronaut_id": astronaut_id,
        "directive_id": directive["id"],
        "directive_title": directive["title"],
        "hazards": directive.get("hazards", []),
        "level": level,
        "created_at": evaluator.now.isoformat(),
        "triggers": sorted(fired, key=lambda t: -LEVEL_RANK[t["level"]]),
        "astronaut_message": (directive.get("astronaut_message") or {}).get(level, ""),
        "actions": (directive.get("actions") or {}).get(level, []),
        "symptoms_to_check": directive.get("symptoms_to_check", []),
        "notify_ground": at_or_above("notify_ground_at"),
        "flight_surgeon_required": at_or_above("flight_surgeon_required_at"),
        "privacy": directive.get("privacy", "normal"),
        "opens_case": level in CASE_OPENING_LEVELS,
    }


def evaluate_exit_criteria(directive, evaluator):
    status = []
    for crit in directive.get("exit_criteria", []):
        ok, evidence = evaluator.evaluate(crit["when"])
        status.append({"description": crit["description"], "met": ok, "evidence": evidence})
    return status


def find_correlations(alerts, evaluator, window="24h"):
    """Agrupa alertas que compartilham um sintoma relatado recentemente (dica para o agente)."""
    reported = set()
    for s in evaluator._in_window(parse_window(window)):
        reported.update(s.get("symptoms") or [])
    groups = {}
    for a in alerts:
        for sym in set(a["symptoms_to_check"]) & reported:
            groups.setdefault(sym, []).append(a["directive_id"])
    return {sym: ids for sym, ids in groups.items() if len(ids) > 1}


def run(telemetry, profile, directives=None):
    astronaut_id = profile["astronaut_id"]
    samples = []
    for s in telemetry:
        if s.get("astronaut_id") == astronaut_id:
            s = dict(s)
            s["_ts"] = parse_ts(s["timestamp"])
            samples.append(s)
    evaluator = Evaluator(samples, profile.get("baseline", {}))
    alerts = []
    for d in directives or load_directives():
        alert = evaluate_directive(d, evaluator, astronaut_id)
        if alert:
            alerts.append(alert)
    alerts.sort(key=lambda a: -LEVEL_RANK[a["level"]])
    return alerts, find_correlations(alerts, evaluator)


# ── CLI ─────────────────────────────────────────────────────────────────────

ICON = {"atencao": "🟡 ATENÇÃO", "alerta": "🟠 ALERTA", "critico": "🔴 CRÍTICO"}


def _fmt_evidence(e):
    if "symptoms_any" in e:
        return "sintomas relatados %s" % (e["observed"] or "nenhum")
    unit = "%" if e.get("relative_to") == "baseline" else ""
    rel = " vs baseline %s" % e.get("baseline") if e.get("relative_to") else ""
    win = " (%s %s)" % (e["agg"], e["window"]) if e.get("window") else ""
    return "%s%s = %s%s %s %s%s%s" % (e["metric"], win, e["observed"], unit, e["op"], e["threshold"], unit, rel)


def main():
    parser = argparse.ArgumentParser(description="Avalia diretivas contra telemetria.")
    parser.add_argument("--telemetry", default=KB_ROOT / "examples" / "telemetry.json")
    parser.add_argument("--profile", default=KB_ROOT / "examples" / "profile.json")
    parser.add_argument("--json", action="store_true", help="saída JSON (para a aplicação)")
    args = parser.parse_args()

    with open(args.telemetry, encoding="utf-8") as fh:
        telemetry = json.load(fh)
    with open(args.profile, encoding="utf-8") as fh:
        profile = json.load(fh)

    alerts, correlations = run(telemetry, profile)

    if args.json:
        print(json.dumps({"alerts": alerts, "correlations": correlations}, ensure_ascii=False, indent=2))
        return

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    print("Astronauta %s | %d alerta(s)\n" % (profile["astronaut_id"], len(alerts)))
    for a in alerts:
        flags = []
        if a["opens_case"]:
            flags.append("abre caso p/ agente")
        if a["notify_ground"]:
            flags.append("notifica solo")
        if a["flight_surgeon_required"]:
            flags.append("médico de voo")
        print("%s  %s — %s  [%s]" % (ICON[a["level"]], a["directive_id"], a["directive_title"], ", ".join(flags) or "-"))
        for t in a["triggers"]:
            print("    • %s (%s): %s" % (t["id"], t["level"], t["description"]))
            for e in t["evidence"]:
                print("        ↳ %s" % _fmt_evidence(e))
        print("    App: \"%s\"" % a["astronaut_message"])
        for act in a["actions"]:
            print("    → %s" % act)
        print()
    if correlations:
        print("Possíveis correlações (o agente deve agrupar num único caso):")
        for sym, ids in correlations.items():
            print("    sintoma '%s' → %s" % (sym, ", ".join(ids)))


if __name__ == "__main__":
    main()
