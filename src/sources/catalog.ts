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
    description: 'A flat map of the world ocean. Currents swirl as thin streaks coloured by temperature: blue is 0 °C, green 10 to 20 °C, yellow about 25 °C and red 32 °C. Warm water fills the tropics and rides the Gulf Stream and Kuroshio; cold water rings Antarctica.',
  },
  {
    id: 'night-lights', svs: 5313, title: 'Change in Night Lights between 2012 and 2023',
    translation: 'brightness@1', scale: 'luminance', recipe: 'orchestra',
    description: 'The Earth at night. Bright points are cities and industry against dark land and ocean. The map shows where light appeared or disappeared over a decade.',
  },
  {
    id: 'aerosols', svs: 5669, title: 'GEOS Aerosols',
    translation: 'sequential@1', scale: 'hue', recipe: 'orchestra', layers: true,
    description: 'A snapshot of particles in the air on 19 August 2025: black carbon from fires in red, dust in violet, sea salt in grey-green and sulfate in bright green. Each type plays as its own sustained voice.',
  },
  {
    id: 'lightning', svs: 5011, title: 'Lightning Events Detected from the ISS 2017-2023',
    translation: 'brightness@1', scale: 'luminance', recipe: 'orchestra',
    description: 'Flashes of lightning seen from the International Space Station. Every flash becomes a drum hit, placed left or right by where on Earth it happens.',
  },
  {
    id: 'co2', svs: 5196, title: 'DYAMOND Global Carbon Dioxide',
    translation: 'sequential@1', scale: 'hue', recipe: 'orchestra',
    description: 'Carbon dioxide over the globe in early 2020, zooming in on the eastern United States. Low values are clear; from about 420 ppm the gas glows beige, then orange, and red at 460 ppm.',
  },
  {
    id: 'forest', svs: 4950, title: 'GEDI Forest Height',
    translation: 'sequential@1', scale: 'colorbar', recipe: 'lullaby',
    description: 'A slowly turning globe shows how tall forests are, from 0 to 50 metres, measured by the GEDI laser on the Space Station. The tallest canopies are in the tropical rainforests of the Amazon, Congo and Southeast Asia.',
  },
  {
    id: 'atmo-river', svs: 4960, title: 'A 3D View of an Atmospheric River',
    translation: 'sequential@1', scale: 'luminance', recipe: 'lullaby',
    description: 'A long river of water vapour flowing through the sky toward a coastline, as seen by an Earth system model.',
  },
  {
    id: 'perpetual-ocean', svs: 5425, title: 'Perpetual Ocean 2: Western Boundary Currents',
    translation: 'sequential@1', scale: 'colorbar', recipe: 'lullaby',
    description: 'The camera flies from a turning globe to the Kuroshio, Agulhas and Gulf Stream currents. Flow lines are coloured by temperature from dark blue (0 °C) through purple and orange to yellow (25 °C).',
  },
  {
    id: 'air-quality', svs: 5533, title: 'Air Quality Model Runs',
    translation: 'sequential@1', scale: 'hue', recipe: 'orchestra',
    description: 'Model frames of pollution in the air we breathe. Stronger colours mean more pollution.',
  },
]

export const SVS_CREDIT = "NASA's Goddard Space Flight Center Scientific Visualization Studio"
