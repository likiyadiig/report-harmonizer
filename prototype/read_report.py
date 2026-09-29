import zipfile, re, html, sys

# The Word file you give it when you run the script
path = sys.argv[1]

# Open the Word file like a zip folder and read the report's text file
with zipfile.ZipFile(path) as z:
    xml = z.read('word/document.xml').decode('utf8')

# Split it into paragraphs
paragraphs = re.findall(r'<w:p[ >].*?</w:p>', xml, flags=re.S)

for i, p in enumerate(paragraphs):
    # Pull out just the words, without the tags
    text = html.unescape(''.join(re.findall(r'<w:t(?: [^>]*)?>([^<]*)</w:t>', p)))
    # Skip headings, empty lines and short table cells
    if len(text.split()) >= 8:
        print(i, text[:100])
