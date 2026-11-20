import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrushParams, SymmetryMode, Stroke, VibePreset } from '../types';
import { DEFAULT_PARAMS, PAL, SYMMETRY_MODES } from '../constants/presets';
import { RenderPipeline } from '../core/renderPipeline';
import { buildStrokeMesh } from '../core/geometry';
import { generateRandomSigil, SigilStyle } from '../core/sigilGenerator';

export interface DocsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeVibe: VibePreset;
  currentVibeName: string;
  initialParams: BrushParams;
  canvasStrokes?: Stroke[];
  onApplyParams?: (params: BrushParams) => void;
}

interface ParamDocItem {
  key: keyof BrushParams;
  label: string;
  category: 'brush' | 'chrome' | 'comp';
  categoryLabel: string;
  min: number;
  max: number;
  step: number;
  defaultVal: number;
  unit: string;
  mechanism: string;
  visualBehavior: string;
  useCases: {
    range: string;
    label: string;
    description: string;
  }[];
  quickValues: {
    label: string;
    value: number;
  }[];
  proTip: string;
}

const PARAM_DOCS: ParamDocItem[] = [
  {
    key: 'width',
    label: 'Width',
    category: 'brush',
    categoryLabel: 'Brush Geometry',
    min: 4,
    max: 60,
    step: 1,
    defaultVal: 14,
    unit: 'px',
    mechanism:
      'Perpendicular ribbon vertex displacement along the spine tangent: r = (width * 0.5) * pressureFactor. Generates high-density ribbon strip geometry.',
    visualBehavior:
      'At 4px, yields delicate surgical wireframe needles and razor barbs. At 18px, creates balanced cybernetic spine horns. At 50px+, creates heavy molten liquid chrome beams with broad reflective surfaces.',
    useCases: [
      { range: '4 - 10px', label: 'Delicate Needles', description: 'Intricate background filigree, micro-spikes, needle barbs, secondary biomechanical webs.' },
      { range: '14 - 22px', label: 'Sweet Spot (Primary Horns)', description: 'Core tribal spines, dominant scythes, balanced specular light sweeps and horizon reflections.' },
      { range: '28 - 60px', label: 'Heavy Chrome Beams', description: 'Monolithic logo lettering, heavy centerpieces, puddle-like molten liquid mercury masses.' },
    ],
    quickValues: [
      { label: 'Needle: 6px', value: 6 },
      { label: 'Default: 14px', value: 14 },
      { label: 'Sweet Spot: 18px', value: 18 },
      { label: 'Heavy: 42px', value: 42 },
    ],
    proTip:
      'Pair higher widths (22px+) with high Fusion (0.75+) to create organic liquid mercury masses that pool together into a single molten alloy body.',
  },
  {
    key: 'taper',
    label: 'Taper',
    category: 'brush',
    categoryLabel: 'Brush Geometry',
    min: 0,
    max: 1,
    step: 0.05,
    defaultVal: 0.5,
    unit: 'ratio',
    mechanism:
      'Polynomial smoothstep envelope smooth01(min(s, len-s) / (8 + taper * 140)) evaluated along stroke arc length s. Smoothly contracts vertex radius to sub-pixel points at stroke endpoints.',
    visualBehavior:
      'At 0.0, endpoints terminate abruptly with blunt cylindrical caps. As taper increases toward 1.0, the endpoints stretch into razor-sharp, lethal gothic stiletto needles.',
    useCases: [
      { range: '0.0 - 0.25', label: 'Blunt Cylinders', description: 'Industrial tubing, structural cybernetic frames, rounded neon glass, metallic conduits.' },
      { range: '0.45 - 0.65', label: 'Sweet Spot (Barbed Horn)', description: 'Classic Y2K tribal flourishes, organic horns, curved mandibles with sharp tips.' },
      { range: '0.80 - 1.0', label: 'Lethal Stilettos', description: 'Aggressive bio-mechanical razor claws, scorpion stingers, gothic flick spikes.' },
    ],
    quickValues: [
      { label: 'Blunt: 0.1', value: 0.1 },
      { label: 'Default: 0.5', value: 0.5 },
      { label: 'Sharp: 0.75', value: 0.75 },
      { label: 'Lethal: 0.95', value: 0.95 },
    ],
    proTip:
      'Draw fast flick strokes with Taper at 0.85+ and Mirror X symmetry for hyper-sharp anime/manga cybernetic spike flourishes.',
  },
  {
    key: 'pressure',
    label: 'Pressure',
    category: 'brush',
    categoryLabel: 'Brush Geometry',
    min: 0,
    max: 1,
    step: 0.05,
    defaultVal: 1,
    unit: 'scale',
    mechanism:
      'Dynamic width scaling factor: 1 + pressure * (2 * p - 1). Interpolates between constant geometric thickness (0) and full stylus pressure / velocity dynamics (1).',
    visualBehavior:
      'At 0.0, stroke width remains perfectly uniform regardless of draw speed or stylus force. At 1.0, light touches yield hairline whispers while heavy presses swell into thick chrome ribbons.',
    useCases: [
      { range: '0.0', label: 'Uniform CAD / Vector', description: 'Mathematical mechanical schematics, circuit tracks, uniform mandala circles, technical stamps.' },
      { range: '0.5 - 0.7', label: 'Controlled Calligraphy', description: 'Consistent graffiti handstyles, logo lettering with predictable line weight.' },
      { range: '0.85 - 1.0', label: 'Sweet Spot (Full Dynamics)', description: 'Expressive cyber-tribal drawing, organic bio-mecha curves, pressure-sensitive tablet art.' },
    ],
    quickValues: [
      { label: 'Uniform: 0.0', value: 0.0 },
      { label: 'Controlled: 0.6', value: 0.6 },
      { label: 'Expressive: 1.0', value: 1.0 },
    ],
    proTip:
      'Lock Pressure to 0.0 when constructing technical sci-fi UI rings or mandala seals to keep stroke widths mathematically constant throughout arcs.',
  },
  {
    key: 'bevel',
    label: 'Bevel',
    category: 'chrome',
    categoryLabel: 'Chrome Shading',
    min: 0.5,
    max: 6.0,
    step: 0.1,
    defaultVal: 3.5,
    unit: 'curv',
    mechanism:
      'Multiplies the distance-field gradient in the chrome fragment shader, controlling the slope of surface normal curvature transitions across stroke cross-sections.',
    visualBehavior:
      'At 0.5, normals slope steeply creating a crisp, hard knife-edge chamfer with razor specular streaks. At 5.0+, normals curve gently into voluptuous, rounded inflatable liquid drops.',
    useCases: [
      { range: '0.8 - 2.0', label: 'Knife-Edge Chamfer', description: 'Stealth fighter facets, cold titanium blades, chiseled gothic fonts, razor armor plates.' },
      { range: '3.0 - 4.5', label: 'Sweet Spot (Liquid Chrome)', description: 'Iconic molten mercury aesthetic, liquid obsidian, organic tribal horns with broad specular gleam.' },
      { range: '5.0 - 6.0', label: 'Inflatable Balloon', description: 'Pillowy Y2K balloon metallics, thick molten solder, heavy droplet physics.' },
    ],
    quickValues: [
      { label: 'Knife Edge: 1.2', value: 1.2 },
      { label: 'Crisp: 2.4', value: 2.4 },
      { label: 'Molten: 3.8', value: 3.8 },
      { label: 'Balloon: 5.5', value: 5.5 },
    ],
    proTip:
      'Lower bevel values (1.5 - 2.2) produce razor-crisp horizon line reflections across narrow strokes, ideal for aggressive razor blades.',
  },
  {
    key: 'chisel',
    label: 'Chisel Ridge',
    category: 'chrome',
    categoryLabel: 'Chrome Shading',
    min: 0,
    max: 1,
    step: 0.05,
    defaultVal: 0.7,
    unit: 'ridge',
    mechanism:
      'Synthesizes an artificial centerline normal crease. In the shader, perturbs surface normal components nx, ny toward opposing lateral directions based on signed distance to stroke center.',
    visualBehavior:
      'At 0.0, the cross-section is a smooth round half-cylinder. At 1.0, the stroke splits down the exact center into a two-sided diamond roof ridge, casting one side in shadow and the other in specular highlight.',
    useCases: [
      { range: '0.0 - 0.2', label: 'Smooth Dome', description: 'Soft fluid mercury, molten gold droplets, organic slime tendrils, soft chrome blobs.' },
      { range: '0.4 - 0.7', label: 'Sweet Spot (Blade Spine)', description: 'Aerodynamic stealth aircraft facets, cyber-gothic sword spines, balanced 3D ridges.' },
      { range: '0.85 - 1.0', label: 'Diamond Razor Crest', description: 'Extreme knife-edge surgical scalpels, gothic cross facets, faceted titanium armor.' },
    ],
    quickValues: [
      { label: 'Smooth: 0.0', value: 0.0 },
      { label: 'Subtle: 0.35', value: 0.35 },
      { label: 'Blade: 0.70', value: 0.70 },
      { label: 'Razor: 1.0', value: 1.0 },
    ],
    proTip:
      'Turn Chisel Ridge up to 0.95 with "Black Mercury" or "Dark Goth" to transform strokes into lethal obsidian daggers.',
  },
  {
    key: 'speed',
    label: 'Shimmer',
    category: 'chrome',
    categoryLabel: 'Chrome Shading',
    min: 0,
    max: 2.0,
    step: 0.05,
    defaultVal: 0.6,
    unit: 'hz',
    mechanism:
      'Scales the continuous time parameter uT * speed driving the specular caustics and horizon reflection sweep across the normal map in the fragment shader.',
    visualBehavior:
      'At 0.0, light reflections are completely static and frozen. At 0.6, liquid reflections gently breathe and shimmer across curves. At 1.5+, high-frequency light caustics race across edges.',
    useCases: [
      { range: '0.0', label: 'Frozen (Still Art)', description: 'Static export for print, still wallpapers, vector tracing, calm drafting.' },
      { range: '0.4 - 0.8', label: 'Sweet Spot (Liquid Ripple)', description: 'Interactive live canvas display, hypnotic screen saver loop, ambient portfolio showcase.' },
      { range: '1.2 - 2.0', label: 'Cyber Rave Surges', description: 'Frantic cyber rave animations, high-energy screen recordings, electric liquid surges.' },
    ],
    quickValues: [
      { label: 'Frozen: 0.0', value: 0.0 },
      { label: 'Gentle: 0.3', value: 0.3 },
      { label: 'Hypnotic: 0.6', value: 0.6 },
      { label: 'Cyber Rave: 1.5', value: 1.5 },
    ],
    proTip:
      'Pair high Shimmer (1.0+) with Iridescence (0.2+) to create mesmerizing flowing rainbow prismatic liquid metal in motion.',
  },
  {
    key: 'iri',
    label: 'Iridescence',
    category: 'chrome',
    categoryLabel: 'Chrome Shading',
    min: 0,
    max: 0.6,
    step: 0.01,
    defaultVal: 0.06,
    unit: 'phase',
    mechanism:
      'Simulates thin-film wave interference optics. Perturbs RGB sampling phases in the reflection environment: specularColor = sin(fresnel * PI * 2.0 + vec3(0.0, 2.0, 4.0)) * iri.',
    visualBehavior:
      'At 0.0, reflections reflect monochrome environment colors strictly. At 0.06, subtle petroleum sheen sparkles at glancing angles. At 0.3+, strokes gleam with holographic rainbow CD-ROM diffraction.',
    useCases: [
      { range: '0.0', label: 'Pure Silver Chrome', description: 'Sterile monochrome silver mirror, stainless steel, industrial raw titanium, clean obsidian.' },
      { range: '0.04 - 0.08', label: 'Sweet Spot (Petrol Sheen)', description: 'Subtle luxury oil slick on mercury, 2000s CD-ROM matrix reflection, authentic early Y2K sheen.' },
      { range: '0.20 - 0.60', label: 'Holographic Rainbow Foil', description: 'Holographic Y2K stickers, iridescent beetle carapaces, hyperpop & rave aesthetics.' },
    ],
    quickValues: [
      { label: 'Pure: 0.0', value: 0.0 },
      { label: 'Oil Slick: 0.06', value: 0.06 },
      { label: 'Holo: 0.22', value: 0.22 },
      { label: 'Max Prism: 0.55', value: 0.55 },
    ],
    proTip:
      'With "Pink K-Pop" or "Cyber Y2K" vibes, set Iridescence to 0.28 for authentic early-2000s Japanese arcade holographic sticker aesthetics.',
  },
  {
    key: 'fusion',
    label: 'Fusion',
    category: 'chrome',
    categoryLabel: 'Chrome Shading',
    min: 0,
    max: 1.0,
    step: 0.05,
    defaultVal: 0.5,
    unit: 'melt',
    mechanism:
      'Dynamic metaball thresholding uThr = 0.5 - 0.3 * fusion over the multi-scale Gaussian blur pyramid. Blends adjacent stroke distance fields into a smooth continuous isosurface.',
    visualBehavior:
      'At 0.0, overlapping strokes display distinct independent boundaries and crisp intersection creases. At 1.0, intersecting strokes liquefy and fuse into a continuous molten alloy blob.',
    useCases: [
      { range: '0.0', label: 'Discrete Lattices', description: 'Complex intersecting geometric lattices, wireframe crosses, overlapping independent thorns.' },
      { range: '0.45 - 0.65', label: 'Sweet Spot (Organic Fillet)', description: 'Natural organic weld filleting where branches sprout out from the main spine.' },
      { range: '0.80 - 1.0', label: 'Molten Mercury Pooling', description: 'Molten mercury puddles, liquid symbiote flesh, heavy dripping chrome blobs.' },
    ],
    quickValues: [
      { label: 'Discrete: 0.0', value: 0.0 },
      { label: 'Organic: 0.50', value: 0.50 },
      { label: 'Molten: 0.80', value: 0.80 },
      { label: 'Max Liquid: 1.0', value: 1.0 },
    ],
    proTip:
      'When using the procedural Sigil Generator or adding spikes, a Fusion value of 0.65 makes branch joints look naturally cast from a single piece of liquid metal.',
  },
  {
    key: 'depth',
    label: '3D Depth',
    category: 'chrome',
    categoryLabel: 'Chrome Shading',
    min: 1.0,
    max: 16.0,
    step: 0.5,
    defaultVal: 6.0,
    unit: 'z-scale',
    mechanism:
      'Z-axis normal extrusion factor: normal = normalize(vec3(dfdx, dfdy, depth)). Scales the apparent thickness and perspective displacement when rotating in 3D orbit mode.',
    visualBehavior:
      'At 1.0, strokes feel like razor-thin metallic foil stamped onto paper. At 6.0, strokes gain heavy embossed volume. At 14.0+, strokes become thick extruded heavy metal bars with steep shadows.',
    useCases: [
      { range: '1.0 - 3.0', label: 'Foil Decal', description: 'Delicate gold-leaf stickers, vector decals, subtle printed logos on matte backgrounds.' },
      { range: '5.0 - 8.0', label: 'Sweet Spot (Embossed Emblem)', description: 'Iconic Y2K cast chrome badges, car grill emblems, video game title sigils.' },
      { range: '10.0 - 16.0', label: 'Heavy Bar Extrusion', description: 'Heavy extruded 3D sculptures, dramatic 3D perspective tilts, armored plating.' },
    ],
    quickValues: [
      { label: 'Foil: 2.0', value: 2.0 },
      { label: 'Embossed: 6.0', value: 6.0 },
      { label: 'Cast Metal: 10.0', value: 10.0 },
      { label: 'Heavy Bar: 15.0', value: 15.0 },
    ],
    proTip:
      'Switch to 3D Orbit Mode and crank Depth to 12+ with auto-orbit to showcase dramatic metallic parallax and reflective specular glints.',
  },
  {
    key: 'glow',
    label: 'Star Glow',
    category: 'comp',
    categoryLabel: 'Optics & FX',
    min: 0,
    max: 1.5,
    step: 0.05,
    defaultVal: 0.15,
    unit: 'bloom',
    mechanism:
      '4-axis directional streak convolution shader (starGlowShader). Isolates pixel luminance exceeding specular threshold and blurs horizontally, vertically, and diagonally into 4-point anime starlight flares.',
    visualBehavior:
      'At 0.0, chrome highlights are hard and clinical. At 0.15, crisp starlight flares twinkle at glancing reflection apexes. At 0.8+, blinding ethereal neon flares bloom across the canvas.',
    useCases: [
      { range: '0.0', label: 'Sharp Studio Specular', description: 'Ultra-sharp SVG/PNG asset export, print graphics, minimalist industrial designs.' },
      { range: '0.10 - 0.25', label: 'Sweet Spot (Starlight Glint)', description: 'Dreamy 2000s magazine sparkle, authentic jewel glint, glossy cybernetic album art.' },
      { range: '0.50 - 1.50', label: 'Anime Flare Explosion', description: 'Anime magical girl transformations, vaporwave ethereal seals, intense dreamcast lens flares.' },
    ],
    quickValues: [
      { label: 'Off: 0.0', value: 0.0 },
      { label: 'Subtle: 0.15', value: 0.15 },
      { label: 'Anime Star: 0.50', value: 0.50 },
      { label: 'Blinding: 1.20', value: 1.20 },
    ],
    proTip:
      'Star Glow triggers specifically on high-specular points—combine with low Bevel (2.0) and high Chisel (0.8) to concentrate dazzling flares along blade edges.',
  },
  {
    key: 'aberration',
    label: 'Aberration',
    category: 'comp',
    categoryLabel: 'Optics & FX',
    min: 0,
    max: 1.0,
    step: 0.02,
    defaultVal: 0.06,
    unit: 'prism',
    mechanism:
      'Radial optical lens prism dispersion in starGlowShader. Offsets the red channel inward toward canvas center and blue channel outward: uv_r = uv - dir * ab, uv_b = uv + dir * ab.',
    visualBehavior:
      'At 0.0, color channels are perfectly aligned. At 0.06, subtle red/cyan fringing mimics vintage CRT glass curvature. At 0.4+, heavy RGB separation tears across edges like a VHS glitch.',
    useCases: [
      { range: '0.0', label: 'Clean Digital Vectors', description: 'Pristine digital production graphics, crisp typography, clean vector artwork.' },
      { range: '0.04 - 0.08', label: 'Sweet Spot (CRT Glass)', description: 'Authentic analog CRT curvature warmth, 1999 television monitor realism.' },
      { range: '0.20 - 0.60', label: 'VHS / Glitch Rift', description: 'Cyberpunk terminal corruptions, VHS glitch aesthetics, psychedelic optical rifts.' },
    ],
    quickValues: [
      { label: 'Clean: 0.0', value: 0.0 },
      { label: 'CRT Glass: 0.06', value: 0.06 },
      { label: 'VHS Glitch: 0.28', value: 0.28 },
      { label: 'Prism Rift: 0.75', value: 0.75 },
    ],
    proTip:
      'Combine Chromatic Aberration (0.15) with Film Noise (0.18) to instantly give clean WebGL strokes the warm grit of scanned rave flyers.',
  },
  {
    key: 'noise',
    label: 'Film Noise',
    category: 'comp',
    categoryLabel: 'Optics & FX',
    min: 0,
    max: 0.5,
    step: 0.01,
    defaultVal: 0.10,
    unit: 'grain',
    mechanism:
      'Procedural animated pseudo-random grain synthesis overlaid via SVG filter or shader canvas mix. Breaks 8-bit color quantization banding on smooth dark gradients.',
    visualBehavior:
      'At 0.0, dark backgrounds are sterile solid black/color with visible gradient banding. At 0.10, micro-tactile silver halide film grain activates. At 0.35+, gritty industrial photocopy noise textures the image.',
    useCases: [
      { range: '0.0', label: 'Digital Clean', description: 'Vector tracing, crisp PNG asset export, clean UI banners.' },
      { range: '0.08 - 0.15', label: 'Sweet Spot (Tactile Grain)', description: 'Eliminating dark gradient color banding, authentic filmic warmth.' },
      { range: '0.25 - 0.50', label: 'Underground Zine Grit', description: 'Underground zine textures, distressed streetwear prints, dark rave posters.' },
    ],
    quickValues: [
      { label: 'Clean: 0.0', value: 0.0 },
      { label: 'Film Grain: 0.10', value: 0.10 },
      { label: 'Analog CRT: 0.22', value: 0.22 },
      { label: 'Zine Grit: 0.45', value: 0.45 },
    ],
    proTip:
      'Add 0.12 Noise whenever exporting images with dark gradient backgrounds ("Dark Goth", "Anubis", "Pink K-Pop") to ensure buttery-smooth gradients without digital steps.',
  },
];

export const DocsModal: React.FC<DocsModalProps> = ({
  isOpen,
  onClose,
  activeVibe,
  currentVibeName,
  initialParams,
  canvasStrokes = [],
  onApplyParams,
}) => {
  // Playground state
  const [params, setParams] = useState<BrushParams>(initialParams);
  const [selectedSigilStyle, setSelectedSigilStyle] = useState<SigilStyle>('cyber-gothic');
  const [selectedSymmetry, setSelectedSymmetry] = useState<SymmetryMode>('Mirror X');
  const [useCanvasStrokes, setUseCanvasStrokes] = useState<boolean>(false);
  const [previewVibeName, setPreviewVibeName] = useState<string>(currentVibeName);

  // View & Animation state in preview canvas
  const [mode3d, setMode3d] = useState<boolean>(false);
  const [animOn, setAnimOn] = useState<boolean>(true);
  const [activeCategory, setActiveCategory] = useState<'all' | 'brush' | 'chrome' | 'comp' | 'symmetry'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedParamKey, setSelectedParamKey] = useState<keyof BrushParams>('bevel');
  const [appliedToast, setAppliedToast] = useState<string>('');

  // Canvas & RenderPipeline refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pipelineRef = useRef<RenderPipeline | null>(null);
  const previewStrokesRef = useRef<Stroke[]>([]);
  const animFrameRef = useRef<number | null>(null);
  const orbRef = useRef<{ y: number; p: number; z: number }>({ y: 0.4, p: 0.3, z: 1.2 });
  const timeRef = useRef<number>(0);

  const activePreviewVibe = useMemo(() => {
    return PAL[previewVibeName] || activeVibe;
  }, [previewVibeName, activeVibe]);

  // Live state refs for render loop closure
  const paramsRef = useRef<BrushParams>(params);
  const vibeRef = useRef<VibePreset>(activePreviewVibe);
  const mode3dRef = useRef<boolean>(mode3d);
  const animOnRef = useRef<boolean>(animOn);

  paramsRef.current = params;
  vibeRef.current = activePreviewVibe;
  mode3dRef.current = mode3d;
  animOnRef.current = animOn;

  // Generate / populate preview strokes
  const generateStrokes = useCallback(
    (style: SigilStyle, sym: SymmetryMode, bParams: BrushParams) => {
      const w = 360;
      const h = 360;
      const center = { x: w / 2, y: h / 2 };
      const generated = generateRandomSigil({
        center,
        scale: 130,
        style,
        symmetry: sym,
        spikeDensity: 0.7,
        spikeLength: 1.0,
        brushParams: bParams,
      });
      return generated;
    },
    []
  );

  // Refresh meshes for preview strokes
  const rebuildPreviewMeshes = useCallback(() => {
    if (!pipelineRef.current) return;
    const pipe = pipelineRef.current;
    const strokes = previewStrokesRef.current;
    const w = 360;
    const h = 360;

    strokes.forEach((s) => {
      s.params = { ...params };
      if (!useCanvasStrokes) {
        s.symmetry = selectedSymmetry;
      }
      buildStrokeMesh(pipe, s, w, h, false);
    });

    pipe.dirty = true;
  }, [params, selectedSymmetry, useCanvasStrokes]);

  // Regenerate sigil or switch source
  const handleRegenerateSigil = useCallback(() => {
    if (!pipelineRef.current) return;
    const pipe = pipelineRef.current;

    // Clean up old meshes
    previewStrokesRef.current.forEach((s) => {
      if (s.group) {
        pipe.root.remove(s.group);
        s.group.traverse((o: any) => {
          if (o.geometry) o.geometry.dispose();
        });
        s.group = null;
      }
    });

    if (useCanvasStrokes && canvasStrokes.length > 0) {
      // Clone user's strokes scaled to fit 360x360
      const cloned: Stroke[] = canvasStrokes.map((s) => ({
        raw: s.raw.map((p) => ({ ...p })),
        group: null,
        params: { ...params },
        symmetry: s.symmetry,
      }));
      previewStrokesRef.current = cloned;
    } else {
      const generated = generateStrokes(selectedSigilStyle, selectedSymmetry, params);
      previewStrokesRef.current = generated;
    }

    rebuildPreviewMeshes();
  }, [useCanvasStrokes, canvasStrokes, selectedSigilStyle, selectedSymmetry, params, generateStrokes, rebuildPreviewMeshes]);

  // Initialize pipeline & canvas
  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const w = 360;
    const h = 360;
    canvas.width = w * Math.min(window.devicePixelRatio || 1, 2);
    canvas.height = h * Math.min(window.devicePixelRatio || 1, 2);

    const pipeline = new RenderPipeline(canvas);
    pipeline.resize(w, h);
    pipeline.applyTheme(activePreviewVibe);
    pipelineRef.current = pipeline;

    // Initialize strokes
    handleRegenerateSigil();

    // Render loop
    let lastT = performance.now();
    const renderLoop = (now: number) => {
      const dt = (now - lastT) * 0.001;
      lastT = now;

      const curParams = paramsRef.current;
      const curVibe = vibeRef.current;
      const isAnim = animOnRef.current;
      const is3d = mode3dRef.current;

      if (isAnim) {
        timeRef.current += dt * (curParams.speed ?? 0.6);
      }

      if (is3d) {
        orbRef.current.y += dt * 0.4;
      }

      const ptr = { x: w / 2, y: h / 2 };
      pipeline.updateUniforms(curParams, curVibe, ptr, timeRef.current);
      pipeline.render(
        curParams,
        is3d,
        false,
        orbRef.current,
        timeRef.current,
        curParams.glow > 0.01,
        curParams.aberration > 0.01,
        false
      );

      animFrameRef.current = requestAnimationFrame(renderLoop);
    };

    animFrameRef.current = requestAnimationFrame(renderLoop);

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (pipelineRef.current) {
        previewStrokesRef.current.forEach((s) => {
          if (s.group) {
            pipelineRef.current?.root.remove(s.group);
            s.group.traverse((o: any) => {
              if (o.geometry) o.geometry.dispose();
            });
            s.group = null;
          }
        });
        pipelineRef.current.dispose();
        pipelineRef.current = null;
      }
    };
  }, [isOpen]); // Mount when opened

  // Update theme when preview vibe changes
  useEffect(() => {
    if (pipelineRef.current) {
      pipelineRef.current.applyTheme(activePreviewVibe);
      pipelineRef.current.dirty = true;
    }
  }, [activePreviewVibe]);

  // Update geometry when width/taper/pressure/symmetry change
  useEffect(() => {
    rebuildPreviewMeshes();
  }, [params.width, params.taper, params.pressure, selectedSymmetry, rebuildPreviewMeshes]);

  // Change single parameter
  const handleParamChange = useCallback((key: keyof BrushParams, val: number) => {
    setParams((prev) => ({
      ...prev,
      [key]: val,
    }));
    if (pipelineRef.current) {
      pipelineRef.current.dirty = true;
    }
  }, []);

  // Reset to default presets
  const handleResetDefaults = useCallback(() => {
    const base = DEFAULT_PARAMS;
    setParams(base);
    if (pipelineRef.current) {
      pipelineRef.current.dirty = true;
    }
    setAppliedToast('Reset to Default Parameters');
    setTimeout(() => setAppliedToast(''), 1500);
  }, []);

  // Apply to active canvas
  const handleApplyToCanvas = useCallback(() => {
    if (onApplyParams) {
      onApplyParams(params);
      setAppliedToast('✓ Applied Parameters to Active Canvas!');
      setTimeout(() => {
        setAppliedToast('');
        onClose();
      }, 900);
    }
  }, [params, onApplyParams, onClose]);

  // Filter parameters by category and search
  const filteredParams = useMemo(() => {
    return PARAM_DOCS.filter((item) => {
      if (activeCategory !== 'all' && item.category !== activeCategory) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        item.label.toLowerCase().includes(q) ||
        item.mechanism.toLowerCase().includes(q) ||
        item.visualBehavior.toLowerCase().includes(q) ||
        item.proTip.toLowerCase().includes(q)
      );
    });
  }, [activeCategory, searchQuery]);

  if (!isOpen) return null;

  return (
    <div
      className="docs-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Parameter Documentation & Interactive Playground"
    >
      <div className="docs-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header Deck */}
        <div className="docs-header">
          <div className="docs-title-row">
            <span className="docs-badge">FIELD MANUAL</span>
            <span className="docs-title">PARAMETER SPECIFICATION & INTERACTIVE LAB</span>
          </div>
          <div className="docs-header-actions">
            {appliedToast && <span className="docs-toast-pill">{appliedToast}</span>}
            {onApplyParams && (
              <button
                className="docs-apply-btn"
                onClick={handleApplyToCanvas}
                title="Apply these playground parameters to the main canvas"
              >
                <span>⚡</span>
                <span>Apply to Canvas</span>
              </button>
            )}
            <button className="docs-close-btn" onClick={onClose} aria-label="Close Documentation">
              ✕
            </button>
          </div>
        </div>

        {/* Modal Main Body: Split View (Interactive Canvas Left + Documentation Guide Right) */}
        <div className="docs-body">
          {/* LEFT COLUMN: Pinned Interactive Preview Deck */}
          <aside className="docs-preview-deck" aria-label="Interactive Preview Deck">
            <div className="docs-deck-header">
              <span className="deck-title-text">LIVE SIGIL LAB</span>
              <span className="deck-fps-badge">WEBGL // 60 FPS</span>
            </div>

            {/* Embedded WebGL Canvas */}
            <div className="docs-canvas-container">
              <canvas
                ref={canvasRef}
                className="docs-webgl-canvas"
                width={360}
                height={360}
                title="Interactive WebGL preview of shader and geometry parameters"
              />
              <div className="docs-canvas-overlay-badges">
                <span className="docs-overlay-vibe">{activePreviewVibe.badge || 'CHROME'}</span>
                {mode3d && <span className="docs-overlay-3d">3D ORBIT</span>}
              </div>
            </div>

            {/* Canvas Quick Controls */}
            <div className="docs-preview-controls">
              {/* Sigil Template Select */}
              <div className="docs-control-group">
                <div className="docs-control-label-row">
                  <span className="docs-label">SIGIL TEMPLATE</span>
                  <button
                    className="docs-mini-btn"
                    onClick={handleRegenerateSigil}
                    title="Regenerate random variation of this archetype"
                  >
                    🎲 Regenerate
                  </button>
                </div>
                <div className="docs-sigil-selector">
                  <button
                    className={`docs-choice-btn ${selectedSigilStyle === 'cyber-gothic' && !useCanvasStrokes ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedSigilStyle('cyber-gothic');
                      setUseCanvasStrokes(false);
                      setTimeout(handleRegenerateSigil, 10);
                    }}
                  >
                    Cyber Gothic
                  </button>
                  <button
                    className={`docs-choice-btn ${selectedSigilStyle === 'bio-mecha' && !useCanvasStrokes ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedSigilStyle('bio-mecha');
                      setUseCanvasStrokes(false);
                      setTimeout(handleRegenerateSigil, 10);
                    }}
                  >
                    Bio-Mecha
                  </button>
                  <button
                    className={`docs-choice-btn ${selectedSigilStyle === 'minimal-blade' && !useCanvasStrokes ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedSigilStyle('minimal-blade');
                      setUseCanvasStrokes(false);
                      setTimeout(handleRegenerateSigil, 10);
                    }}
                  >
                    Minimal Blade
                  </button>
                  <button
                    className={`docs-choice-btn ${selectedSigilStyle === 'radial-seal' && !useCanvasStrokes ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedSigilStyle('radial-seal');
                      setUseCanvasStrokes(false);
                      setTimeout(handleRegenerateSigil, 10);
                    }}
                  >
                    Radial Seal
                  </button>
                  {canvasStrokes.length > 0 && (
                    <button
                      className={`docs-choice-btn ${useCanvasStrokes ? 'active' : ''}`}
                      onClick={() => {
                        setUseCanvasStrokes(true);
                        setTimeout(handleRegenerateSigil, 10);
                      }}
                      title="Use active user-drawn canvas strokes"
                    >
                      ✏️ My Drawing ({canvasStrokes.length})
                    </button>
                  )}
                </div>
              </div>

              {/* Symmetry & View Mode Row */}
              <div className="docs-control-group">
                <span className="docs-label">SYMMETRY & PERSPECTIVE</span>
                <div className="docs-button-row">
                  <select
                    className="docs-select"
                    value={selectedSymmetry}
                    onChange={(e) => {
                      setSelectedSymmetry(e.target.value as SymmetryMode);
                    }}
                    title="Change symmetry plane"
                  >
                    {SYMMETRY_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {mode}
                      </option>
                    ))}
                  </select>

                  <button
                    className={`docs-toggle-btn ${mode3d ? 'active' : ''}`}
                    onClick={() => setMode3d((v) => !v)}
                    title="Toggle 3D Orbit Perspective"
                  >
                    3D: {mode3d ? 'ON' : 'OFF'}
                  </button>

                  <button
                    className={`docs-toggle-btn ${animOn ? 'active' : ''}`}
                    onClick={() => setAnimOn((v) => !v)}
                    title="Toggle Specular / Horizon Ripple Animation"
                  >
                    ANIM: {animOn ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>

              {/* Vibe Preset Selector */}
              <div className="docs-control-group">
                <span className="docs-label">ENVIRONMENT VIBE</span>
                <select
                  className="docs-select"
                  value={previewVibeName}
                  onChange={(e) => setPreviewVibeName(e.target.value)}
                  title="Switch environmental reflection vibe"
                >
                  {Object.keys(PAL).map((vibeKey) => (
                    <option key={vibeKey} value={vibeKey}>
                      {PAL[vibeKey].name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Deck Actions: Reset Defaults */}
              <div className="docs-deck-footer">
                <button
                  className="docs-reset-btn"
                  onClick={handleResetDefaults}
                  title="Reset all playground sliders to standard defaults"
                >
                  ↺ Reset All to Defaults
                </button>
              </div>
            </div>
          </aside>

          {/* RIGHT COLUMN: Parameter Documentation Guide & Deep-Dive */}
          <main className="docs-content-deck" aria-label="Parameter Documentation Explorer">
            {/* Filter Navigation Bar */}
            <div className="docs-nav-bar">
              <div className="docs-category-tabs" role="tablist">
                <button
                  role="tab"
                  aria-selected={activeCategory === 'all'}
                  className={`docs-cat-btn ${activeCategory === 'all' ? 'active' : ''}`}
                  onClick={() => setActiveCategory('all')}
                >
                  All ({PARAM_DOCS.length})
                </button>
                <button
                  role="tab"
                  aria-selected={activeCategory === 'brush'}
                  className={`docs-cat-btn ${activeCategory === 'brush' ? 'active' : ''}`}
                  onClick={() => setActiveCategory('brush')}
                >
                  Brush Geometry (3)
                </button>
                <button
                  role="tab"
                  aria-selected={activeCategory === 'chrome'}
                  className={`docs-cat-btn ${activeCategory === 'chrome' ? 'active' : ''}`}
                  onClick={() => setActiveCategory('chrome')}
                >
                  Chrome Material (6)
                </button>
                <button
                  role="tab"
                  aria-selected={activeCategory === 'comp'}
                  className={`docs-cat-btn ${activeCategory === 'comp' ? 'active' : ''}`}
                  onClick={() => setActiveCategory('comp')}
                >
                  Optics & FX (3)
                </button>
                <button
                  role="tab"
                  aria-selected={activeCategory === 'symmetry'}
                  className={`docs-cat-btn ${activeCategory === 'symmetry' ? 'active' : ''}`}
                  onClick={() => setActiveCategory('symmetry')}
                >
                  Symmetry Guide
                </button>
              </div>

              <div className="docs-search-wrapper">
                <input
                  type="text"
                  className="docs-search-input"
                  placeholder="Filter parameters (e.g. bevel, ridge, rainbow)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Filter parameters"
                />
                {searchQuery && (
                  <button
                    className="docs-search-clear"
                    onClick={() => setSearchQuery('')}
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Parameter Cards List */}
            <div className="docs-cards-scrollable">
              {activeCategory === 'symmetry' ? (
                /* Specialized Symmetry & Sigil Architecture Guide */
                <div className="docs-special-guide">
                  <div className="docs-guide-hero">
                    <span className="docs-badge">GEOMETRIC ARCHITECTURE</span>
                    <h2 className="docs-guide-title">Symmetry Planes & Sigil Morphology</h2>
                    <p className="docs-guide-desc">
                      Y2K Neothorn tribal geometry achieves its hypnotic balance through mathematical symmetry reflection planes.
                      Test each mode below on the live preview canvas to understand their compositional power.
                    </p>
                  </div>

                  <div className="docs-sym-grid">
                    {[
                      {
                        mode: 'Mirror X' as SymmetryMode,
                        title: 'Mirror X (Vertical Bilateral Axis)',
                        desc: 'The foundational Y2K tribal archetype. Duplicates strokes across the vertical center line. Creates insectoid carapaces, angelic wings, beetle shields, and gothic cross crests.',
                        tag: 'PRIMARY AESTHETIC',
                      },
                      {
                        mode: 'Mirror Y' as SymmetryMode,
                        title: 'Mirror Y (Horizontal Horizon Axis)',
                        desc: 'Reflects strokes across the horizontal waterline. Ideal for landscape horizon reflections, mechanical waterbugs, and dual-pole sci-fi emblems.',
                        tag: 'REFLECTION',
                      },
                      {
                        mode: 'Mirror X+Y' as SymmetryMode,
                        title: 'Mirror X+Y (Quad-Quadrant Cross)',
                        desc: '4-fold reflection across both axes. Generates lethal cybernetic shurikens, sniper crosshairs, symmetrical crests, and gothic iron crosses.',
                        tag: 'SHURIKEN / CROSS',
                      },
                      {
                        mode: 'Radial 4' as SymmetryMode,
                        title: 'Radial 4 (4-Point Stargate)',
                        desc: '90-degree rotational symmetry. Forms compass roses, occult four-wind seals, and balanced cyber emblems with identical rotating blades.',
                        tag: 'STAR SEAL',
                      },
                      {
                        mode: 'Radial 6' as SymmetryMode,
                        title: 'Radial 6 (Hexagonal Cyber-Snowflake)',
                        desc: '60-degree rotational symmetry. Creates hyper-intricate hexagonal matrix seals, mechanical iris gears, and biomechanical snowflake shields.',
                        tag: 'HEX MATRIX',
                      },
                      {
                        mode: 'Radial 8' as SymmetryMode,
                        title: 'Radial 8 (Octagonal Hyper-Mandala)',
                        desc: '45-degree rotational symmetry. Transforms simple curved strokes into mesmerizing high-density sacred geometry and occult techno-wheels.',
                        tag: 'HYPER MANDALA',
                      },
                    ].map((item) => (
                      <div
                        key={item.mode}
                        className={`docs-sym-card ${selectedSymmetry === item.mode ? 'active' : ''}`}
                        onClick={() => setSelectedSymmetry(item.mode)}
                      >
                        <div className="docs-sym-header">
                          <span className="docs-sym-tag">{item.tag}</span>
                          <button
                            className={`docs-sym-btn ${selectedSymmetry === item.mode ? 'active' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSymmetry(item.mode);
                            }}
                          >
                            {selectedSymmetry === item.mode ? '✓ Active in Lab' : 'Try in Lab'}
                          </button>
                        </div>
                        <h3 className="docs-sym-title">{item.title}</h3>
                        <p className="docs-sym-desc">{item.desc}</p>
                      </div>
                    ))}
                  </div>

                  <div className="docs-pro-box">
                    <span className="docs-pro-label">PRO TRIBAL WORKFLOW:</span>
                    <p>
                      Start drawing with <strong>Mirror X</strong> to lay down the central spine and outer wings.
                      Then switch to <strong>None</strong> to draw subtle asymmetrical stingers and barbed signature flourishes!
                    </p>
                  </div>
                </div>
              ) : (
                /* Parameter Cards */
                filteredParams.map((item) => {
                  const currentValue = params[item.key] ?? item.defaultVal;
                  const isSelected = selectedParamKey === item.key;

                  return (
                    <article
                      key={item.key}
                      className={`param-doc-card ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => setSelectedParamKey(item.key)}
                      id={`doc-param-${item.key}`}
                    >
                      {/* Card Header & Live Slider Bar */}
                      <div className="param-doc-header">
                        <div className="param-doc-title-block">
                          <span className="param-cat-badge">{item.categoryLabel}</span>
                          <h3 className="param-doc-name">{item.label}</h3>
                          <span className="param-key-tag">`{item.key}`</span>
                        </div>
                        <div className="param-doc-readout-block">
                          <span className="param-readout-num">
                            {Number(currentValue).toFixed(item.step < 0.1 ? 2 : 1)}
                          </span>
                          <span className="param-readout-unit">{item.unit}</span>
                        </div>
                      </div>

                      {/* Interactive Slider Row */}
                      <div className="param-doc-slider-row">
                        <span className="param-slider-bound">{item.min}</span>
                        <input
                          type="range"
                          className="param-doc-slider"
                          min={item.min}
                          max={item.max}
                          step={item.step}
                          value={currentValue}
                          onChange={(e) => handleParamChange(item.key, parseFloat(e.target.value))}
                          aria-label={`Adjust ${item.label}`}
                        />
                        <span className="param-slider-bound">{item.max}</span>
                      </div>

                      {/* Quick Value Try Pills */}
                      <div className="param-quick-pills">
                        <span className="quick-pills-label">TRY PRESETS:</span>
                        {item.quickValues.map((qv) => {
                          const isActive = Math.abs(currentValue - qv.value) < item.step * 0.5;
                          return (
                            <button
                              key={qv.label}
                              className={`doc-val-pill ${isActive ? 'active' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleParamChange(item.key, qv.value);
                              }}
                            >
                              {qv.label}
                            </button>
                          );
                        })}
                      </div>

                      {/* Deep-Dive Technical & Visual Explanations */}
                      <div className="param-doc-details">
                        {/* 1. How It Works */}
                        <div className="param-detail-section">
                          <div className="detail-heading">
                            <span className="detail-icon">⚙️</span>
                            <span className="detail-title">HOW IT WORKS UNDER THE HOOD</span>
                          </div>
                          <p className="detail-text">{item.mechanism}</p>
                        </div>

                        {/* 2. Visual Behavior */}
                        <div className="param-detail-section">
                          <div className="detail-heading">
                            <span className="detail-icon">👁️</span>
                            <span className="detail-title">VISUAL INTUITION & BEHAVIOR</span>
                          </div>
                          <p className="detail-text">{item.visualBehavior}</p>
                        </div>

                        {/* 3. When to Use What Value */}
                        <div className="param-detail-section">
                          <div className="detail-heading">
                            <span className="detail-icon">🎯</span>
                            <span className="detail-title">WHEN TO USE WHAT VALUE</span>
                          </div>
                          <div className="param-use-cases">
                            {item.useCases.map((uc) => (
                              <div key={uc.range} className="param-use-case-row">
                                <span className="use-case-range">{uc.range}</span>
                                <div className="use-case-content">
                                  <span className="use-case-label">{uc.label}:</span>{' '}
                                  <span className="use-case-desc">{uc.description}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* 4. Pro Combination Tip */}
                        <div className="param-pro-tip-box">
                          <span className="pro-tip-icon">💡</span>
                          <div className="pro-tip-content">
                            <span className="pro-tip-tag">PRO CYBERNETIC TIP:</span>
                            <span className="pro-tip-text">{item.proTip}</span>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};
