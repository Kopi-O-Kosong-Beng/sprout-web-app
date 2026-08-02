"""
Builds server/data/almanac-taxonomy.json from the published Singapore flora
checklist. One-off, kept for provenance: re-run it if the selection rules change
or the source is updated.

    Chong, K. Y., Tan, H. T. W. & Corlett, R. T. (2009).
    A Checklist of the Total Vascular Plant Flora of Singapore:
    Native, Naturalised and Cultivated Species.
    Raffles Museum of Biodiversity Research, National University of Singapore.

    python3 -m venv .venv && .venv/bin/pip install pypdf
    .venv/bin/python scripts/extract-flora-checklist.py path/to/checklist.pdf

The PDF holds the same ~4,190 species three times over, as three tables with
different final columns: status (pp. 13-95), origin (pp. 96-190) and growth form
(pp. 191-277). Every row reads `N. Species Authority; Family; value`, so the
three are parsed separately and joined on the binomial.

Selection, in order:
  1. Keep only species the checklist itself calls common, naturalised or casual.
     Those are the ones a player can actually walk up to. Extinct and the
     threatened categories are excluded — an almanac you cannot complete is a
     worse game — as is `cultivated only`, which is 1,492 species and mostly
     landscaping stock nobody can name.
  2. Drop the 19 fern and clubmoss families, leaving flowering plants only.
  3. Round-robin across families, so no single family dominates: Poaceae and
     Cyperaceae alone have 64 common species, and an almanac that is a third
     roadside grass is unplayable.
Common names are NOT in the source. They are hand-added afterwards for the
species where the name is well established, and left null otherwise.
"""
import json
import re
import sys
from collections import defaultdict

STATUS_PAGES = (12, 94)
ORIGIN_PAGES = (95, 189)
FORM_PAGES = (190, 276)

# Ferns and clubmosses in the candidate pool. The checklist is vascular plants
# only, so excluding these leaves angiosperms — no gymnosperm family survives
# the status filter, and fungi were never in scope.
NON_ANGIOSPERM_FAMILIES = {
    "Adiantaceae", "Aspleniaceae", "Blechnaceae", "Davalliaceae", "Dennstaedtiaceae",
    "Dryopteridaceae", "Gleicheniaceae", "Lycopodiaceae", "Oleandraceae",
    "Ophioglossaceae", "Polypodiaceae", "Psilotaceae", "Pteridaceae", "Salviniaceae",
    "Schizaeaceae", "Selaginellaceae", "Thelypteridaceae", "Vittariaceae", "Woodsiaceae",
}

# Common names are not in the checklist. These are hand-added for species whose
# English or Malay name is well established in Singapore; everything else stays
# null rather than carry a name invented to fill the column.
COMMON_NAMES = {
    "Acanthus ilicifolius": "Sea holly",
    "Alpinia galanga": "Greater galangal",
    "Alstonia angustiloba": "Pulai",
    "Ananas comosus": "Pineapple",
    "Arundina graminifolia": "Bamboo orchid",
    "Avicennia alba": "Api-api putih",
    "Avicennia officinalis": "Api-api ludat",
    "Azadirachta indica": "Neem",
    "Bacopa monnieri": "Brahmi",
    "Boehmeria nivea": "Ramie",
    "Bromheadia finlaysoniana": "Pale reed orchid",
    "Bruguiera gymnorhiza": "Large-leafed orange mangrove",
    "Canna indica": "Indian shot",
    "Carica papaya": "Papaya",
    "Carmona retusa": "Fukien tea",
    "Caryota mitis": "Fishtail palm",
    "Cassytha filiformis": "Love vine",
    "Casuarina equisetifolia": "Casuarina",
    "Centella asiatica": "Pegaga",
    "Chrysobalanus icaco": "Coco plum",
    "Cinnamomum iners": "Wild cinnamon",
    "Clidemia hirta": "Koster's curse",
    "Coccinia grandis": "Ivy gourd",
    "Cocos nucifera": "Coconut palm",
    "Cordyline fruticosa": "Ti plant",
    "Costus speciosus": "Crepe ginger",
    "Dianella ensifolia": "Common dianella",
    "Dillenia suffruticosa": "Simpoh air",
    "Dracaena fragrans": "Corn plant",
    "Duchesnea indica": "Mock strawberry",
    "Eichhornia crassipes": "Water hyacinth",
    "Eryngium foetidum": "Sawtooth coriander",
    "Fagraea fragrans": "Tembusu",
    "Flacourtia jangomas": "Rukam",
    "Gloriosa superba": "Flame lily",
    "Heliconia psittacorum": "Parrot's beak heliconia",
    "Hippobroma longiflora": "Star of Bethlehem",
    "Kalanchoe pinnata": "Miracle leaf",
    "Lantana camara": "Common lantana",
    "Leea indica": "Bandicoot berry",
    "Limnocharis flava": "Yellow velvetleaf",
    "Malpighia coccigera": "Singapore holly",
    "Melastoma malabathricum": "Singapore rhododendron",
    "Mimusops elengi": "Tanjong",
    "Nepenthes gracilis": "Slender pitcher plant",
    "Oxalis corniculata": "Creeping woodsorrel",
    "Pandanus odorifer": "Screwpine",
    "Passiflora foetida": "Stinking passionflower",
    "Persicaria chinensis": "Chinese knotweed",
    "Piper sarmentosum": "Wild betel",
    "Plumbago zeylanica": "Ceylon leadwort",
    "Portulaca oleracea": "Common purslane",
    "Rhodomyrtus tomentosa": "Kemunting",
    "Rivina humilis": "Bloodberry",
    "Scaevola taccada": "Sea lettuce",
    "Schefflera actinophylla": "Umbrella tree",
    "Scoparia dulcis": "Sweet broomweed",
    "Sesamum indicum": "Sesame",
    "Sesuvium portulacastrum": "Sea purslane",
    "Sonneratia alba": "Mangrove apple",
    "Spathodea campanulata": "African tulip tree",
    "Tabebuia rosea": "Trumpet tree",
    "Terminalia catappa": "Sea almond",
    "Turnera subulata": "White buttercup",
    "Typha angustifolia": "Narrow-leaved cattail",
    "Xylocarpus granatum": "Nyireh bunga",
    "Zephyranthes rosea": "Pink rain lily",
    "Zingiber zerumbet": "Shampoo ginger",
}

STATUS_RANK = {"common": 0, "naturalised": 1, "casual": 2}
# The extractor splits a handful of words across a line break.
REPAIRS = {"exo tic": "exotic", "nativ e": "native", "na tive": "native"}
ENTRY = re.compile(r"^\s*(\d{1,4})\.\s+(.*)$")
BINOMIAL = re.compile(r"^[A-Z][a-z]+ [a-z][a-z-]+$")
TARGET_COUNT = 200


def read_table(reader, first_page, last_page):
    """Rows of `(name, family, value)`, rejoining entries split over lines."""
    bodies, current = [], None
    for index in range(first_page, last_page + 1):
        for line in (reader.pages[index].extract_text() or "").split("\n"):
            match = ENTRY.match(line)
            if match:
                if current:
                    bodies.append(current)
                current = match.group(2).strip()
            elif current and line.strip() and not line.strip().isdigit():
                if "Checklist of the Total" in line or line.strip() == "Chong et al.":
                    continue  # running header
                current = f"{current} {line.strip()}"
    if current:
        bodies.append(current)

    rows = []
    for body in bodies:
        parts = [part.strip() for part in body.split(";")]
        if len(parts) >= 3:
            rows.append((parts[0], parts[1], parts[2].lower()))
    return rows


def binomial(name):
    """Genus + epithet, dropping the authority and any infraspecific rank."""
    return " ".join(name.replace("×", "x ").split()[:2])


def main(pdf_path, output_path):
    from pypdf import PdfReader

    reader = PdfReader(pdf_path)
    origin = {binomial(n): v for n, _, v in read_table(reader, *ORIGIN_PAGES)}
    form = {binomial(n): v for n, _, v in read_table(reader, *FORM_PAGES)}

    pool = []
    for name, family, status in read_table(reader, *STATUS_PAGES):
        key = binomial(name)
        if status not in STATUS_RANK or family in NON_ANGIOSPERM_FAMILIES:
            continue
        if not BINOMIAL.match(key):
            continue
        growth = REPAIRS.get(form.get(key, ""), form.get(key, "")).split(" weed")[0]
        pool.append({
            "speciesName": key,
            "family": family,
            "status": status,
            "origin": REPAIRS.get(origin.get(key, ""), origin.get(key, "")) or None,
            "growthForm": growth or None,
        })

    by_family = defaultdict(list)
    for row in pool:
        by_family[row["family"]].append(row)
    for rows in by_family.values():
        rows.sort(key=lambda row: (STATUS_RANK[row["status"]], row["speciesName"]))

    selected, depth = [], 0
    while len(selected) < TARGET_COUNT:
        took_any = False
        for family in sorted(by_family):
            if len(by_family[family]) > depth:
                selected.append(by_family[family][depth])
                took_any = True
                if len(selected) == TARGET_COUNT:
                    break
        if not took_any:
            break
        depth += 1

    for row in selected:
        row["id"] = row["speciesName"].lower().replace(" ", "-")
        row["commonName"] = COMMON_NAMES.get(row["speciesName"])

    with open(output_path, "w") as handle:
        json.dump(selected, handle, indent=2)
        handle.write("\n")
    print(f"wrote {len(selected)} species from {len(pool)} candidates to {output_path}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: extract-flora-checklist.py <checklist.pdf> [output.json]")
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "server/data/almanac-taxonomy.json")
