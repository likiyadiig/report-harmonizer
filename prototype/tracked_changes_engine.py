"""Tracked-changes engine (starter for consultant-tool).

What it does: takes a list of edits (paragraph number, old text, new text,
optional comment) and writes them into a Word file as tracked changes,
word by word, with optional comments for sentences to check.

In the real tool, the EDITS list comes from the Claude API instead of
being written by hand. Unzip the .docx first, run this, then zip it again.
"""
import re, difflib, subprocess, html

DOC = 'un2/word/document.xml'
AUTHOR = 'Report Harmonizer (test)'
DATE = '2026-09-28T12:00:00Z'
SK = '/mnt/skills/public/docx/scripts'

# Fill this from the Claude API: (paragraph index, old text, new text, comment or None)
EDITS = []

TOKEN = re.compile(r"\s+|[A-Za-z0-9$%\u2019'\-\u2013/]+|[^\sA-Za-z0-9]")
rev_id = [900000]

def nid():
    rev_id[0] += 1
    return rev_id[0]

def esc(t):
    return html.escape(t, quote=False)

def t_el(tag, t):
    sp = ' xml:space="preserve"' if (t[:1].isspace() or t[-1:].isspace()) else ''
    return f'<w:{tag}{sp}>{esc(t)}</w:{tag}>'

def plain(rpr, t):
    return f'<w:r>{rpr}{t_el("t", t)}</w:r>' if t else ''

def ins(rpr, t):
    return f'<w:ins w:id="{nid()}" w:author="{AUTHOR}" w:date="{DATE}"><w:r>{rpr}{t_el("t", t)}</w:r></w:ins>' if t else ''

def dele(rpr, t):
    return f'<w:del w:id="{nid()}" w:author="{AUTHOR}" w:date="{DATE}"><w:r>{rpr}{t_el("delText", t)}</w:r></w:del>' if t else ''

def diff_runs(rpr, old, new):
    a, b = TOKEN.findall(old), TOKEN.findall(new)
    ops = difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes()
    # absorb whitespace-only equal blocks sitting between two changes
    merged = []
    for op in ops:
        merged.append(list(op))
    i = 1
    while i < len(merged) - 1:
        tag, i1, i2, j1, j2 = merged[i]
        if tag == 'equal' and ''.join(a[i1:i2]).isspace() and merged[i-1][0] != 'equal' and merged[i+1][0] != 'equal':
            p, n = merged[i-1], merged[i+1]
            merged[i-1:i+2] = [['replace', p[1], n[2], p[3], n[4]]]
            i = max(i - 1, 1)
        else:
            i += 1
    out = []
    for tag, i1, i2, j1, j2 in merged:
        if tag == 'equal':
            out.append(plain(rpr, ''.join(a[i1:i2])))
        else:
            out.append(dele(rpr, ''.join(a[i1:i2])))
            out.append(ins(rpr, ''.join(b[j1:j2])))
    return ''.join(out)

def add_comment(text):
    r = subprocess.run(['python', f'{SK}/comment.py', 'un2/', text, '--author', AUTHOR, '--initials', 'RH'],
                       capture_output=True, text=True, check=True)
    m = re.search(r'<w:commentRangeStart w:id="(\d+)"', r.stdout)
    return m.group(1)

x = open(DOC, encoding='utf8').read()
spans = [m.span() for m in re.finditer(r'<w:p[ >].*?</w:p>', x, flags=re.S)]

by_para = {}
for e in EDITS:
    by_para.setdefault(e[0], []).append(e)

for pi in sorted(by_para, reverse=True):
    s, e = spans[pi]
    p = x[s:e]
    for _, old, new, comment in by_para[pi]:
        tracked = [m.span() for m in re.finditer(r'<w:(ins|del) .*?</w:\1>', p, flags=re.S)]
        hit = None
        for m in re.finditer(r'<w:r(?: [^>]*)?>.*?</w:r>', p, flags=re.S):
            if any(ts <= m.start() < te for ts, te in tracked):
                continue
            run = m.group(0)
            ts_ = re.findall(r'<w:t(?: [^>]*)?>([^<]*)</w:t>', run)
            text = html.unescape(''.join(ts_))
            if old in text and len(ts_) == 1 and 'Reference' not in run:
                assert hit is None, ('ambiguous', pi, old)
                hit = (m.span(), run, text)
        assert hit, ('not found', pi, old)
        (rs, re_), run, text = hit
        rpr_m = re.search(r'<w:rPr>.*?</w:rPr>', run, flags=re.S)
        rpr = rpr_m.group(0) if rpr_m else ''
        k = text.index(old)
        pre, post = text[:k], text[k+len(old):]
        middle = diff_runs(rpr, old, new) if old != new else plain(rpr, old)
        if comment:
            cid = add_comment(comment)
            middle = (f'<w:commentRangeStart w:id="{cid}"/>' + middle +
                      f'<w:commentRangeEnd w:id="{cid}"/><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr>'
                      f'<w:commentReference w:id="{cid}"/></w:r>')
        p = p[:rs] + plain(rpr, pre) + middle + plain(rpr, post) + p[re_:]
    x = x[:s] + p + x[e:]

open(DOC, 'w', encoding='utf8').write(x)
print('done', len(EDITS), 'edits')
