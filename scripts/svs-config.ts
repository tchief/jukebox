/**
 * Which file of each SVS visualisation we play, and how to read its colours.
 * Chosen by hand from the SVS API listings: full-globe flat maps where they
 * exist, H.264/VP9 (not H.265/ProRes), no hyperwall tiles, no burned-in labels.
 * Colour bar coordinates were measured on the SVS colour bar images.
 */
export interface ColorbarSpec {
  file: string
  /** Row (y) and start/end x of the gradient, in image pixels. */
  y: number; x0: number; x1: number
  min: number; max: number; units: string
  label: string
}

export interface SvsConfig {
  svs: number
  /** Display + analysis media file name (from the SVS API). */
  media: string
  /** Seconds of the clip to use (the jukebox loops this part). */
  maxSeconds: number
  scale: { kind: 'colorbar'; bar: ColorbarSpec } | { kind: 'luminance'; label: string } | { kind: 'hue'; label: string }
  categories?: { name: string; rgb: [number, number, number] }[]
  /** Treat sudden brightness jumps as events (lightning). Off for camera moves. */
  flashes?: boolean
  /** Brightness jump (0..1) that counts as a flash; small yellow dots need a low one. */
  flashThreshold?: number
}

export const SVS_CONFIG: SvsConfig[] = [
  {
    svs: 3912, media: 'ecco2_sst_flow.mp4', maxSeconds: 90,
    scale: { kind: 'colorbar', bar: { file: 'sst_ecco2_cbar.png', y: 68, x0: 14, x1: 291, min: 0, max: 32, units: '°C', label: 'Sea surface temperature' } },
  },
  {
    svs: 5313, media: 'nightlights_flat_series_and_change_wZooms_13_EIC_2160p30_h265.mp4', maxSeconds: 90,
    scale: { kind: 'luminance', label: 'Brightness of night lights' },
  },
  {
    svs: 5669, media: 'Aerosols_2025-08-19T20_00_00_1920x1080.png', maxSeconds: 40,
    scale: { kind: 'luminance', label: 'Aerosol thickness (brightness)' },
    categories: [
      { name: 'black carbon', rgb: [210, 95, 70] },
      { name: 'dust', rgb: [196, 155, 222] },
      { name: 'sea salt', rgb: [135, 175, 172] },
      { name: 'sulfate', rgb: [80, 225, 50] },
    ],
  },
  {
    svs: 5011, media: 'iss_lightning_sos_yearly_07312023_2048p60.mp4', maxSeconds: 90, flashes: true, flashThreshold: 0.05,
    scale: { kind: 'luminance', label: 'Lightning flashes (brightness)' },
  },
  {
    svs: 5196, media: 'dyamondPointCloud_3-29-2023a_dyamond_co2_anim_globe_zoom_1080p30.mp4', maxSeconds: 90,
    scale: { kind: 'colorbar', bar: { file: 'dyamondCbar_6-27-2024a.png', y: 377, x0: 238, x1: 1681, min: 380, max: 460, units: 'ppm', label: 'Carbon dioxide' } },
  },
  {
    svs: 4950, media: 'GEDI_global_2160p60.webm', maxSeconds: 60,
    scale: { kind: 'colorbar', bar: { file: 'GEDI_colorbar_0to50_01_print.jpg', y: 509, x0: 52, x1: 484, min: 0, max: 50, units: 'm', label: 'Forest height' } },
  },
  {
    svs: 4960, media: 'atmos_river_HD.mp4', maxSeconds: 90,
    scale: { kind: 'luminance', label: 'Water vapour (brightness)' },
  },
  {
    svs: 5425, media: 'perpetual_ocean2_CLOSE_096_temperature_1080p30.mp4', maxSeconds: 90,
    scale: { kind: 'colorbar', bar: { file: 'perpetual_ocean2_CLOSE_101_cbar_temperature.png', y: 539, x0: 262, x1: 1656, min: 0, max: 25, units: '°C', label: 'Ocean temperature' } },
  },
  {
    svs: 5533, media: 'EIC_AirQuality_Preview_3840x1080.mp4', maxSeconds: 90,
    scale: { kind: 'hue', label: 'Pollution (colour)' },
  },
]
