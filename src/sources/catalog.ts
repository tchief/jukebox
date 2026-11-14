/**
 * The jukebox catalogue: NASA EIC / SVS visualisations recommended in the
 * challenge resources, each with the translation that fits its data.
 * Descriptions are written for screen-reader users.
 */
export type ScaleHint = 'colorbar' | 'hue' | 'luminance' | 'thermal'

export interface CatalogEntry {
  id: string
  svs?: number
  title: string
  translation: string
  scale: ScaleHint
  /** Suggested sound variant. */
  recipe: string
  description: string
  /** What the colours mean, if known. */
  colors?: string
  /** Multi-layer visual: each colour family plays as its own voice. */
  layers?: boolean
}

export const CATALOG: CatalogEntry[] = [
  {
    id: 'demo-ocean', title: 'Demo: synthetic ocean (offline test, not NASA data)',
    translation: 'sequential@1', scale: 'thermal', recipe: 'orchestra',
    description: 'A generated world map of sea temperature for testing without internet. Warm water near the equator, cold near the poles, slow warm eddies drifting east, and lightning flashes over the tropics.',
    colors: 'Blue is cold, white is mild, red is hot.',
  },
  {
    id: 'sst-currents', svs: 3912, title: 'Global Sea Surface Currents and Temperature',
    translation: 'sequential@1', scale: 'colorbar', recipe: 'orchestra',
    description: 'Ocean currents swirl around the globe while their colour shows the water temperature: warm water near the equator and in currents like the Gulf Stream, cold water near the poles.',
  },
  {
    id: 'night-lights', svs: 5313, title: 'Change in Night Lights between 2012 and 2023',
    translation: 'brightness@1', scale: 'luminance', recipe: 'orchestra',
    description: 'The Earth at night. Bright points are cities and industry against dark land and ocean. The map shows where light appeared or disappeared over a decade.',
  },
  {
    id: 'aerosols', svs: 5669, title: 'GEOS Aerosols',
    translation: 'sequential@1', scale: 'hue', recipe: 'orchestra', layers: true,
    description: 'Smoke, dust, sea salt and other particles moving through the atmosphere, each type in its own colour. Each colour family plays as its own sustained voice.',
  },
  {
    id: 'lightning', svs: 5011, title: 'Lightning Events Detected from the ISS 2017-2023',
    translation: 'brightness@1', scale: 'luminance', recipe: 'orchestra',
    description: 'Flashes of lightning seen from the International Space Station. Every flash becomes a drum hit, placed left or right by where on Earth it happens.',
  },
  {
    id: 'co2', svs: 5196, title: 'DYAMOND Global Carbon Dioxide',
    translation: 'sequential@1', scale: 'hue', recipe: 'orchestra',
    description: 'Carbon dioxide spreading through the atmosphere from cities, fires and forests, rising and falling with the seasons.',
  },
  {
    id: 'forest', svs: 4950, title: 'GEDI Forest Height',
    translation: 'sequential@1', scale: 'colorbar', recipe: 'lullaby',
    description: 'A world map of how tall forests are. The tallest canopies are in the tropical rainforests of the Amazon, Congo and Southeast Asia.',
  },
  {
    id: 'atmo-river', svs: 4960, title: 'A 3D View of an Atmospheric River',
    translation: 'sequential@1', scale: 'luminance', recipe: 'lullaby',
    description: 'A long river of water vapour flowing through the sky toward a coastline, as seen by an Earth system model.',
  },
  {
    id: 'perpetual-ocean', svs: 5425, title: 'Perpetual Ocean 2: Western Boundary Currents',
    translation: 'brightness@1', scale: 'luminance', recipe: 'lullaby',
    description: 'Bright streaks trace the fast ocean currents along the western edges of the ocean basins, like the Gulf Stream and the Kuroshio.',
  },
  {
    id: 'air-quality', svs: 5533, title: 'Air Quality Model Runs',
    translation: 'sequential@1', scale: 'hue', recipe: 'orchestra',
    description: 'Model frames of pollution in the air we breathe. Stronger colours mean more pollution.',
  },
]

export const SVS_CREDIT = "NASA's Goddard Space Flight Center Scientific Visualization Studio"
