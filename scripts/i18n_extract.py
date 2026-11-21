"""Move hard-coded Polish UI strings to i18n (namespace given per call). Usage: python3 i18n_extract.py (edits in place)."""
import json, collections, re, sys

SRC = "/app/frontend/src"


def apply(file, ns, table, module_level=()):
    """table: list of (pl, key, en). module_level: PL strings living in module-scope consts → getters."""
    path = f"{SRC}/{file}"
    s = open(path).read()
    for pl, key, en in table:
        k = f"{ns}.{key}"
        call = f'i18n.t("{k}")'
        n0 = s
        q = json.dumps(pl, ensure_ascii=False)
        if pl in module_level:
            s = re.sub(r'(\b\w+): ' + re.escape(q), lambda m: f'get {m.group(1)}() {{ return {call}; }}', s)
        s = s.replace(f"label: {q}", f"label: {call}")
        s = s.replace(f"placeholder={q}", f"placeholder={{{call}}}").replace(f"label={q}", f"label={{{call}}}").replace(f"title={q}", f"title={{{call}}}").replace(f"description={q}", f"description={{{call}}}").replace(f"aria-label={q}", f"aria-label={{{call}}}")
        s = s.replace(f"toast.error({q})", f"toast.error({call})").replace(f"toast.success({q})", f"toast.success({call})")
        s = s.replace(f">{pl}<", f">{{{call}}}<")
        s = re.sub(r"(\n\s+)" + re.escape(pl) + r"(\n)", lambda m: f"{m.group(1)}{{{call}}}{m.group(2)}", s)
        if s == n0:
            print("NOT FOUND:", file, pl)
    if 'import i18n from "@/i18n";' not in s:
        s = 'import i18n from "@/i18n";\n' + s
    open(path, "w").write(s)
    for lang, idx in (("pl", 0), ("en", 2)):
        p = f"{SRC}/i18n/locales/{lang}.json"
        d = json.load(open(p), object_pairs_hook=collections.OrderedDict)
        node = d.setdefault(ns, collections.OrderedDict())
        for row in table:
            node[row[1]] = row[idx]
        open(p, "w").write(json.dumps(d, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    exec(open(sys.argv[1]).read())
