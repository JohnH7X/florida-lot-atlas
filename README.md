# Florida Lot Atlas

Static browser map of Florida parcels from the Florida Department of Revenue tax roll (Florida Statewide Parcels, published by the Florida GIO): owner and mailing address, just/assessed/taxable value, homestead, the two latest sales, use code, year built, living area and legal description, with satellite imagery, Street View, side lengths on every parcel line, and the property-file module (branded reports, Florida agreement and disclosure worksheets, pre-offer checklist with documentary-stamp estimate). No backend; property files stay in the browser.

Parcels are queried live; address search uses the Esri World geocoder limited to Florida. Rebuild the static county layers with `python3 scripts/prepare_state.py --state 12 --name Florida --office "property appraiser" --count N --output public/data --checked-date YYYY-MM-DD`. Zoning is local and not published statewide.
