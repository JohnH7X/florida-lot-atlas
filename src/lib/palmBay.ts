/** City of Palm Bay public map (gis.palmbayflorida.org): the layers of its "City Map" web app, drawn as image overlays. */
const ROOT = 'https://gis.palmbayflorida.org/arcgis/rest/services';
export const PALM_BAY_BOUNDS: [number, number, number, number] = [-80.78, 27.85, -80.45, 28.12];
export interface PalmBayLayer { id: string; label: string; service: string; on: boolean }
export const PALM_BAY_LAYERS: PalmBayLayer[] = [
  { id: 'limits', label: 'City limits', service: 'CommonServices/CityLimits', on: true },
  { id: 'water', label: 'Water / sewer availability', service: 'CommonServices/WaterSewerAvail', on: true },
  { id: 'hydrants', label: 'Fire hydrants (zoomed in)', service: 'UT/FireHydrants', on: true },
  { id: 'units', label: 'Units', service: 'CommonServices/Units', on: false },
  { id: 'trash', label: 'Trash pickup zones', service: 'RepublicTrashBND', on: false },
];
export const palmBayTiles = (service: string) =>
  `${ROOT}/${service}/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=png32&transparent=true&f=image`;
