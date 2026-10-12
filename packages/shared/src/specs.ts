/**
 * Specification forms per category, for products a shop adds that are not in the catalog yet (docs/DECISIONS.md #30).
 * Keys match the demo catalog (supabase/seed/data-products.mjs): variant options are lowercase (`ram`, `storage`)
 * and become the variant chips customers pick from; specs use the English names customers read (`Processor`).
 */

export interface SpecField {
  /** Stored key: lowercase for variant options, the display name for specs. */
  key: string;
  /** Form label; defaults to the key. */
  label?: string;
  placeholder?: string;
  /** Tap-to-fill suggestions. Any other value can still be typed. */
  options?: string[];
  /** Turns the value into a highlight on product cards; `{v}` is the value, e.g. `{v} RAM`. */
  highlight?: string;
}

export interface SpecTemplate {
  /** The options customers choose between: RAM, storage, colour… */
  variant: SpecField[];
  /** Everything else about the product. */
  specs: SpecField[];
  /** Example of a full product name in this category. */
  nameExample?: string;
}

/** A free name/value specification row. */
export interface SpecRow {
  k: string;
  v: string;
}

const YES_NO = ['Yes', 'No'];
const COLOURS = ['Black', 'White', 'Blue', 'Silver', 'Grey', 'Green'];
const PC_RAM = ['8 GB', '16 GB', '32 GB', '64 GB'];
const PC_STORAGE = ['256 GB SSD', '512 GB SSD', '1 TB SSD', '2 TB SSD', '1 TB HDD'];
const PC_OS = ['Windows 11 Home', 'Windows 11 Pro', 'macOS', 'Chrome OS', 'No OS (DOS)'];
const WIRELESS = ['USB wired', 'Wireless 2.4 GHz', 'Bluetooth', 'Wireless + Bluetooth'];
const SOCKETS = ['AM4', 'AM5', 'LGA 1700', 'LGA 1851'];
const BOARD_SIZES = ['ATX', 'Micro-ATX', 'Mini-ITX'];

/** A field: `f('Display', '6.7-inch AMOLED, 120Hz', { highlight: '{v}' })`. */
const f = (key: string, placeholder?: string, more: Omit<SpecField, 'key' | 'placeholder'> = {}): SpecField => ({ key, placeholder, ...more });
const pick = (key: string, options: string[], more: Omit<SpecField, 'key' | 'options'> = {}): SpecField => ({ key, options, placeholder: options[0], ...more });
const hl = '{v}';

const colour = pick('colour', COLOURS, { label: 'Colour' });
const ram = (options = PC_RAM) => pick('ram', options, { label: 'RAM', placeholder: options[1], highlight: '{v} RAM' });
const storage = (options = PC_STORAGE) => pick('storage', options, { label: 'Storage', placeholder: options[1], highlight: hl });
const capacity = (options: string[], highlight?: string) => pick('capacity', options, { label: 'Capacity', highlight });
const length = (options: string[]) => pick('length', options, { label: 'Length' });
const channels = (options = ['4', '8', '16', '32']) => pick('channels', options, { label: 'Channels', highlight: '{v} channel' });

export const SPEC_TEMPLATES: Record<string, SpecTemplate> = {
  // Mobiles
  smartphones: {
    nameExample: 'Samsung Galaxy S24 FE 5G (8GB, 128GB, Blue)',
    variant: [ram(['4 GB', '6 GB', '8 GB', '12 GB', '16 GB']), storage(['64 GB', '128 GB', '256 GB', '512 GB', '1 TB']), colour],
    specs: [
      f('Display', '6.7-inch AMOLED, 120Hz', { highlight: hl }),
      f('Processor', 'Snapdragon 7s Gen 2', { highlight: hl }),
      f('Rear camera', '50 MP + 8 MP', { highlight: '{v} camera' }),
      f('Front camera', '16 MP'),
      f('Battery', '5000 mAh', { highlight: hl }),
      f('Charging', '45W fast charging'),
      pick('Network', ['5G', '4G']),
      pick('SIM', ['Dual SIM', 'Dual (nano-SIM + eSIM)', 'Single SIM']),
      f('OS', 'Android 15'),
      pick('Connector', ['USB-C', 'Lightning']),
    ],
  },
  tablets: {
    nameExample: 'Apple iPad (11-inch, Wi-Fi, 128GB, Blue)',
    variant: [ram(['4 GB', '6 GB', '8 GB', '12 GB']), storage(['64 GB', '128 GB', '256 GB', '512 GB']), pick('connectivity', ['Wi-Fi', 'Wi-Fi + Cellular'], { label: 'Connectivity' }), colour],
    specs: [
      f('Display', '11-inch, 2.5K, 90Hz', { highlight: hl }),
      f('Processor', 'MediaTek Helio G99', { highlight: hl }),
      f('Camera', '8 MP rear, 5 MP front'),
      f('Battery', '8000 mAh', { highlight: hl }),
      pick('Connector', ['USB-C', 'Lightning']),
      f('Extras', 'Stylus support, quad speakers'),
    ],
  },
  smartwatches: {
    nameExample: 'Noise ColorFit Pro 6 (1.85-inch AMOLED, Black)',
    variant: [pick('size', ['40 mm', '42 mm', '44 mm', '46 mm', '1.96-inch'], { label: 'Size' }), colour],
    specs: [
      f('Display', '1.96-inch AMOLED, Always-On', { highlight: hl }),
      f('Health', 'Heart rate, SpO2, sleep', { highlight: hl }),
      f('Battery', 'Up to 7 days', { highlight: hl }),
      pick('GPS', ['Built-in', 'Connected (phone)', 'No']),
      pick('Calling', ['Bluetooth calling', 'eSIM', 'No']),
      f('Water resistance', 'IP68 / 5 ATM'),
      f('Compatible', 'Android and iPhone'),
    ],
  },
  earbuds: {
    nameExample: 'boAt Airdopes 141 ANC (Black)',
    variant: [colour],
    specs: [
      pick('Type', ['True wireless (TWS)', 'Neckband', 'Over-ear', 'On-ear', 'Wired'], { highlight: hl }),
      pick('Noise cancellation', ['Active (ANC)', 'ENC for calls', 'None'], { highlight: hl }),
      f('Battery', 'Up to 42 hrs with case', { highlight: hl }),
      f('Charging', 'Type-C, 10 min = 2 hrs'),
      f('Bluetooth', '5.3'),
      f('Water resistance', 'IPX4'),
    ],
  },
  chargers: {
    nameExample: 'Samsung 25W USB-C Fast Charger (White)',
    variant: [],
    specs: [
      f('Output', '25W USB-C PD', { highlight: hl }),
      pick('Ports', ['1x USB-C', '1x USB-A', 'USB-C + USB-A', '2x USB-C']),
      f('Fast charging', 'PD 3.0, PPS'),
      pick('Cable included', YES_NO),
      f('Compatible', 'Samsung, iPhone, all USB-C phones'),
    ],
  },
  cables: {
    nameExample: 'Ambrane USB-C to USB-C 60W Braided Cable (1 m)',
    variant: [length(['1 m', '1.5 m', '2 m'])],
    specs: [
      pick('Type', ['USB-C to USB-C', 'USB-A to USB-C', 'USB-C to Lightning', 'USB-A to Micro-USB'], { highlight: hl }),
      f('Power', 'Up to 60W', { highlight: hl }),
      f('Data speed', '480 Mbps'),
      pick('Material', ['Braided', 'Rubber (TPE)']),
    ],
  },
  cases: {
    nameExample: 'Spigen Rugged Armor Case for Galaxy S24 FE (Black)',
    variant: [colour],
    specs: [
      f('Compatible', 'Galaxy S24 FE', { highlight: 'For {v}' }),
      pick('Material', ['Silicone', 'TPU', 'Hard PC', 'Leather', 'Rugged']),
      pick('Type', ['Back cover', 'Flip cover', 'Wallet']),
      pick('MagSafe', YES_NO),
    ],
  },
  'screen-guards': {
    nameExample: 'Tempered Glass for iPhone 15 (Pack of 2)',
    variant: [],
    specs: [
      f('Compatible', 'iPhone 15', { highlight: 'For {v}' }),
      pick('Type', ['Tempered glass', 'Privacy glass', 'Matte', 'Hydrogel', 'Camera lens']),
      pick('Coverage', ['Full screen, edge-to-edge', '2.5D', 'Camera only']),
      pick('Pack', ['1', '2', '3']),
    ],
  },
  'power-banks': {
    nameExample: 'Mi 20000mAh 22.5W Power Bank (Black)',
    variant: [capacity(['10000 mAh', '20000 mAh', '30000 mAh'], hl), colour],
    specs: [
      f('Output', '22.5W fast charging', { highlight: hl }),
      f('Ports', '2x USB-A, 1x USB-C'),
      f('Input', 'USB-C 18W'),
      f('Weight', '420 g'),
    ],
  },

  // CCTV & Security
  'cctv-cameras': {
    nameExample: 'CP Plus 2MP Full HD IR Dome Camera (Indoor)',
    variant: [
      pick('resolution', ['2 MP', '4 MP', '5 MP', '8 MP (4K)'], { label: 'Resolution', highlight: hl }),
      pick('type', ['Dome', 'Bullet', 'PTZ', 'Wi-Fi', 'Turret'], { label: 'Camera type', highlight: '{v} camera' }),
    ],
    specs: [
      pick('Signal', ['HD analog (AHD/TVI/CVI)', 'IP (PoE)', 'Wi-Fi']),
      pick('Use', ['Indoor', 'Outdoor'], { highlight: hl }),
      f('Night vision', 'Up to 30 m IR / colour', { highlight: hl }),
      f('Lens', '3.6 mm'),
      pick('Weatherproof', ['IP66', 'IP67', 'No']),
      pick('Audio', ['Built-in mic', 'Two-way audio', 'None']),
      f('Storage', 'microSD up to 256 GB'),
      f('Network', 'PoE, H.265+'),
    ],
  },
  'dvr-nvr': {
    nameExample: 'Hikvision 8 Channel DVR (DS-7208HGHI)',
    variant: [channels()],
    specs: [
      pick('Type', ['DVR (analog cameras)', 'NVR (IP cameras)', 'XVR (hybrid)'], { highlight: hl }),
      f('Recording', '5 MP lite / 1080p', { highlight: hl }),
      f('Storage', '1 SATA, up to 10 TB', { highlight: hl }),
      f('Output', 'HDMI + VGA'),
      f('PoE ports', '8 (NVR only)'),
      f('Remote viewing', 'Mobile app'),
    ],
  },
  'surveillance-hdd': {
    nameExample: 'WD Purple 2TB Surveillance Hard Drive',
    variant: [capacity(['1 TB', '2 TB', '4 TB', '6 TB', '8 TB'], hl)],
    specs: [
      f('Series', 'WD Purple / Seagate SkyHawk', { highlight: hl }),
      f('Interface', 'SATA 6 Gb/s'),
      pick('Form factor', ['3.5-inch', '2.5-inch']),
      f('RPM', '5400'),
    ],
  },
  'cctv-power': {
    nameExample: 'CCTV SMPS Power Supply 12V 10A (8 Channel)',
    variant: [channels(['4', '8', '16'])],
    specs: [
      f('Output', '12V DC, 10A', { highlight: hl }),
      pick('Type', ['SMPS', 'Adapter', 'PoE switch']),
      f('Input', 'AC 100-240V'),
    ],
  },
  'cctv-cables': {
    nameExample: 'CCTV 3+1 Copper Cable (90 m)',
    variant: [length(['90 m', '180 m', '305 m'])],
    specs: [
      pick('Type', ['3+1 coaxial', 'Cat6', 'Cat5e', 'Power cable'], { highlight: hl }),
      pick('Conductor', ['Copper', 'CCA']),
      pick('Use', ['Indoor', 'Outdoor']),
    ],
  },
  'video-door-phones': {
    nameExample: 'Godrej 7-inch Video Door Phone',
    variant: [pick('screen', ['4.3-inch', '7-inch', '10-inch'], { label: 'Screen', highlight: '{v} screen' })],
    specs: [
      f('Door station', 'Night vision, rain cover', { highlight: hl }),
      pick('Wiring', ['2-wire', '4-wire', 'Wi-Fi']),
      f('Memory', 'Snapshots and video'),
      f('Unlock', 'Electric lock support'),
    ],
  },
  'cctv-kits': {
    nameExample: 'CP Plus 4 Camera 2MP CCTV Kit with 1TB HDD',
    variant: [channels(['4', '8', '16']), pick('resolution', ['2 MP', '4 MP', '5 MP'], { label: 'Resolution', highlight: hl })],
    specs: [
      f('Cameras', '2 dome + 2 bullet', { highlight: hl }),
      f('Recorder', '4 channel DVR', { highlight: hl }),
      f('Storage', '1 TB surveillance HDD', { highlight: hl }),
      f('Accessories', 'SMPS, 90 m cable, connectors'),
      pick('Installation', ['Included', 'Not included']),
    ],
  },
  'installation-service': {
    nameExample: 'CCTV Installation (up to 4 cameras)',
    variant: [],
    specs: [
      f('Includes', 'Mounting, wiring up to 15 m per camera, app setup', { highlight: hl }),
      f('Excludes', 'Cable, conduit, ladder above 12 ft'),
      f('Cameras covered', 'Up to 4'),
      f('Visit charge', 'Free within 5 km'),
      f('Work warranty', '30 days'),
    ],
  },

  // Laptops & Computers
  laptops: {
    nameExample: 'HP Victus 15 (Ryzen 5 7535HS, 16GB, 512GB SSD, RTX 2050)',
    variant: [ram(), storage(), colour],
    specs: [
      f('Processor', 'Intel Core i5-1335U / Ryzen 5 7530U', { highlight: hl }),
      f('Display', '15.6-inch FHD IPS, 144Hz', { highlight: hl }),
      f('Graphics', 'Integrated / NVIDIA RTX 3050 4 GB', { highlight: hl }),
      pick('OS', PC_OS),
      f('Weight', '1.6 kg'),
      f('Battery', 'Up to 8 hrs'),
      f('Ports', 'USB-C, 2x USB-A, HDMI'),
      pick('Keyboard', ['Backlit', 'Not backlit']),
    ],
  },
  desktops: {
    nameExample: 'Gaming PC (i5-12400F, 16GB, 512GB SSD, RTX 4060)',
    variant: [ram(), storage()],
    specs: [
      f('Processor', 'Intel Core i5-12400F', { highlight: hl }),
      f('Graphics', 'NVIDIA RTX 4060 8 GB', { highlight: hl }),
      f('Motherboard', 'B760M DDR4'),
      f('PSU', '650W 80+ Bronze'),
      f('Cabinet', 'Mid tower, ARGB fans'),
      pick('OS', PC_OS),
      pick('Wi-Fi', ['Built-in', 'Not included']),
      pick('Monitor included', YES_NO),
    ],
  },
  'all-in-ones': {
    nameExample: 'Lenovo IdeaCentre AIO 3 (i5-1335U, 16GB, 512GB SSD)',
    variant: [ram(), storage()],
    specs: [
      f('Processor', 'Intel Core i5-1335U', { highlight: hl }),
      f('Display', '23.8-inch FHD IPS', { highlight: hl }),
      f('Graphics', 'Integrated'),
      pick('OS', PC_OS),
      f('Webcam', '1080p'),
      pick('Keyboard & mouse', ['Included', 'Not included']),
    ],
  },
  monitors: {
    nameExample: 'LG 24-inch FHD IPS Monitor 100Hz (24MS500)',
    variant: [pick('size', ['21.5"', '24"', '27"', '32"', '34"'], { label: 'Size', highlight: hl })],
    specs: [
      pick('Resolution', ['1920 x 1080 (FHD)', '2560 x 1440 (QHD)', '3840 x 2160 (4K)'], { highlight: hl }),
      pick('Panel', ['IPS', 'VA', 'TN', 'OLED'], { highlight: hl }),
      pick('Refresh rate', ['60Hz', '75Hz', '100Hz', '144Hz', '165Hz', '240Hz'], { highlight: hl }),
      f('Response time', '1 ms'),
      f('Ports', 'HDMI, DisplayPort, VGA'),
      pick('Speakers', ['Built-in', 'No']),
      pick('Stand', ['Tilt', 'Height adjustable', 'VESA mount']),
    ],
  },

  // Components
  'graphics-cards': {
    nameExample: 'Zotac Gaming GeForce RTX 4060 Twin Edge 8GB',
    variant: [pick('memory', ['4 GB', '8 GB', '12 GB', '16 GB'], { label: 'Memory', placeholder: '8 GB' })],
    specs: [
      f('GPU', 'NVIDIA GeForce RTX 4060', { highlight: hl }),
      pick('Memory type', ['GDDR6', 'GDDR6X', 'GDDR7', 'GDDR5'], { highlight: hl }),
      f('Boost clock', '2490 MHz'),
      f('Power', '115W, 1x 8-pin', { highlight: hl }),
      f('Recommended PSU', '550W'),
      f('Outputs', '3x DisplayPort, 1x HDMI'),
      pick('Cooling', ['Single fan', 'Dual fan', 'Triple fan']),
      f('Interface', 'PCIe 4.0 x8'),
    ],
  },
  processors: {
    nameExample: 'AMD Ryzen 5 7600 Desktop Processor',
    variant: [],
    specs: [
      f('Cores', '6 cores / 12 threads', { highlight: hl }),
      f('Clock', '3.8 - 5.1 GHz', { highlight: hl }),
      pick('Socket', SOCKETS, { highlight: hl }),
      f('TDP', '65W'),
      pick('Cooler', ['Included', 'Not included']),
      pick('Graphics', ['Integrated', 'None (F)']),
      f('Generation', 'Ryzen 7000 / Intel 14th gen'),
    ],
  },
  motherboards: {
    nameExample: 'MSI PRO B760M-E DDR4 Motherboard',
    variant: [],
    specs: [
      f('Chipset', 'B760 / B650 / H610', { highlight: hl }),
      pick('Socket', SOCKETS, { highlight: hl }),
      pick('Form factor', BOARD_SIZES, { highlight: hl }),
      f('Memory', '2x DDR4, up to 64 GB'),
      f('M.2', '2 slots'),
      f('Network', 'Wi-Fi 6, 2.5G LAN'),
      f('PCIe', 'PCIe 4.0 x16'),
    ],
  },
  ram: {
    nameExample: 'Corsair Vengeance 16GB DDR5 5600MHz Desktop RAM',
    variant: [capacity(['8 GB', '16 GB', '16 GB (2 x 8 GB)', '32 GB (2 x 16 GB)'], hl)],
    specs: [
      pick('Type', ['DDR4', 'DDR5', 'DDR3'], { highlight: hl }),
      f('Speed', '3200 MHz / 5600 MHz', { highlight: hl }),
      pick('Form factor', ['DIMM (desktop)', 'SODIMM (laptop)'], { highlight: hl }),
      f('Latency', 'CL16'),
      pick('RGB', YES_NO),
    ],
  },
  storage: {
    nameExample: 'Samsung 990 EVO 1TB NVMe M.2 SSD',
    variant: [capacity(['256 GB', '512 GB', '1 TB', '2 TB', '4 TB'], hl)],
    specs: [
      pick('Type', ['NVMe SSD', 'SATA SSD', 'Hard disk (HDD)', 'External HDD', 'External SSD', 'Pen drive'], { highlight: hl }),
      f('Interface', 'PCIe 4.0 x4 NVMe / SATA / USB 3.2', { highlight: hl }),
      f('Read speed', '5000 MB/s', { highlight: '{v} read' }),
      f('Write speed', '4200 MB/s'),
      pick('Form factor', ['M.2 2280', '2.5-inch', '3.5-inch', 'Portable']),
      f('Speed', '7200 RPM (hard disks)'),
    ],
  },
  psu: {
    nameExample: 'Deepcool PK650D 650W 80+ Bronze Power Supply',
    variant: [pick('wattage', ['450W', '550W', '650W', '750W', '850W', '1000W'], { label: 'Wattage', placeholder: '650W', highlight: hl })],
    specs: [
      pick('Efficiency', ['80 PLUS', '80 PLUS Bronze', '80 PLUS Gold', '80 PLUS Platinum'], { highlight: hl }),
      pick('Modular', ['No', 'Semi', 'Fully'], { highlight: '{v} modular' }),
      pick('Form factor', ['ATX', 'SFX']),
      pick('PCIe 5.0 connector', YES_NO),
      f('Fan', '120 mm'),
    ],
  },
  cabinets: {
    nameExample: 'Ant Esports ICE-112 Mid Tower Cabinet (Black)',
    variant: [pick('colour', ['Black', 'White'], { label: 'Colour' })],
    specs: [
      pick('Form factor', ['ATX mid tower', 'Micro-ATX', 'Mini-ITX', 'Full tower'], { highlight: hl }),
      f('Fans', '4 x ARGB included', { highlight: hl }),
      pick('Side panel', ['Tempered glass', 'Mesh', 'Acrylic']),
      f('Front I/O', 'USB-C, 2x USB 3.0, audio'),
      f('GPU clearance', '330 mm'),
      f('Radiator support', 'Up to 360 mm'),
    ],
  },
  coolers: {
    nameExample: 'Deepcool AK400 CPU Air Cooler',
    variant: [],
    specs: [
      pick('Type', ['Air, single tower', 'Air, dual tower', 'Liquid (AIO) 240 mm', 'Liquid (AIO) 360 mm'], { highlight: hl }),
      f('TDP', '220W', { highlight: '{v} TDP' }),
      f('Fan', '120 mm'),
      f('Fans', '1 x 120 mm'),
      f('Socket support', 'AM4, AM5, LGA 1700'),
      pick('RGB', ['ARGB', 'RGB', 'None']),
    ],
  },

  // Peripherals
  keyboards: {
    nameExample: 'Redragon K552 Mechanical Gaming Keyboard (Red switches)',
    variant: [pick('switches', ['Red (linear)', 'Blue (clicky)', 'Brown (tactile)', 'Membrane'], { label: 'Switches' })],
    specs: [
      pick('Connection', WIRELESS, { highlight: hl }),
      pick('Layout', ['Full size', 'TKL', '75%', '60%'], { highlight: hl }),
      pick('Type', ['Mechanical', 'Membrane']),
      pick('Backlight', ['RGB', 'White', 'None']),
      f('Battery', 'Up to 24 months'),
      pick('Combo', ['Keyboard only', 'Keyboard + mouse']),
    ],
  },
  mice: {
    nameExample: 'Logitech G102 Gaming Mouse (Black)',
    variant: [colour],
    specs: [
      pick('Connection', WIRELESS, { highlight: hl }),
      f('DPI', 'Up to 8000 DPI', { highlight: hl }),
      f('Sensor', 'Optical'),
      f('Buttons', '6'),
      f('Battery', 'Up to 12 months'),
      f('Weight', '85 g'),
    ],
  },
  headsets: {
    nameExample: 'HyperX Cloud Stinger 2 Gaming Headset',
    variant: [colour],
    specs: [
      pick('Connection', ['3.5 mm', 'USB', 'Wireless 2.4 GHz', 'Bluetooth'], { highlight: hl }),
      f('Drivers', '50 mm', { highlight: '{v} drivers' }),
      pick('Mic', ['Noise-cancelling', 'Detachable', 'Built-in', 'None'], { highlight: '{v} mic' }),
      pick('Surround', ['7.1 virtual', 'Stereo']),
      f('Battery', 'Up to 30 hrs'),
      f('Compatible', 'PC, PS5, mobile'),
    ],
  },
  webcams: {
    nameExample: 'Logitech C270 HD Webcam',
    variant: [],
    specs: [
      pick('Resolution', ['720p 30fps', '1080p 30fps', '1080p 60fps', '2K', '4K'], { highlight: hl }),
      pick('Mic', ['Mono', 'Stereo', 'Noise-cancelling', 'None']),
      pick('Focus', ['Fixed', 'Auto']),
      f('Mount', 'Monitor clip, tripod thread'),
      pick('Privacy shutter', YES_NO),
    ],
  },
  printers: {
    nameExample: 'Epson L3250 Ink Tank Printer (Wi-Fi)',
    variant: [],
    specs: [
      pick('Type', ['Ink tank', 'Inkjet', 'Laser (mono)', 'Laser (colour)', 'Dot matrix', 'Thermal'], { highlight: hl }),
      pick('Functions', ['Print only', 'Print, scan, copy', 'Print, scan, copy, fax'], { highlight: hl }),
      pick('Connection', ['USB', 'Wi-Fi', 'Wi-Fi + Ethernet'], { highlight: hl }),
      f('Speed', '33 ppm'),
      pick('Duplex', ['Automatic', 'Manual']),
      f('Paper size', 'A4'),
      f('Ink / toner', '003 ink bottles'),
    ],
  },
  routers: {
    nameExample: 'TP-Link Archer AX23 Wi-Fi 6 Router',
    variant: [],
    specs: [
      pick('Standard', ['Wi-Fi 5', 'Wi-Fi 6', 'Wi-Fi 6E', 'Wi-Fi 7'], { highlight: hl }),
      f('Speed', 'AX1800 (1201 + 574 Mbps)', { highlight: hl }),
      pick('Bands', ['2.4 GHz', '2.4 + 5 GHz (dual band)', 'Tri-band']),
      f('Ports', '4x Gigabit LAN'),
      f('Antennas', '4'),
      pick('Type', ['Router', 'Mesh system', '4G / 5G router', 'Range extender']),
    ],
  },
  ups: {
    nameExample: 'APC Back-UPS 600VA UPS',
    variant: [capacity(['600VA', '1000VA', '1100VA', '1500VA', '2 kVA'], hl)],
    specs: [
      pick('Type', ['Line interactive', 'Online', 'Inverter'], { highlight: hl }),
      f('Outlets', '3', { highlight: '{v} outlets' }),
      f('Backup', '10-15 min for a PC'),
      f('Battery', '12V 7Ah'),
      pick('Display', ['LCD', 'LED']),
    ],
  },
  speakers: {
    nameExample: 'JBL Flip 6 Portable Bluetooth Speaker (Blue)',
    variant: [colour],
    specs: [
      pick('Type', ['Bluetooth portable', '2.0 desktop', '2.1 with subwoofer', 'Soundbar', 'Party speaker'], { highlight: hl }),
      f('Power', '20W RMS', { highlight: hl }),
      f('Battery', 'Up to 12 hrs'),
      f('Rating', 'IP67 waterproof'),
      f('Connectivity', 'Bluetooth 5.3, AUX, USB'),
      f('Channels', '2.1'),
    ],
  },

  // Main categories: used for sub-categories added later that have no form of their own.
  mobiles: { variant: [colour], specs: [f('Compatible', 'Galaxy S24 FE', { highlight: 'For {v}' }), f('Battery'), f('Connector', 'USB-C')] },
  'cctv-security': { variant: [], specs: [pick('Use', ['Indoor', 'Outdoor'], { highlight: hl }), f('Power', '12V DC'), f('Compatible', 'Any DVR / NVR')] },
  'laptops-computers': { variant: [ram(), storage()], specs: [f('Processor', 'Intel Core i5', { highlight: hl }), f('Display'), f('Graphics'), pick('OS', PC_OS)] },
  components: { variant: [], specs: [f('Compatible', 'AM5 / LGA 1700', { highlight: hl }), f('Interface'), f('Power')] },
  peripherals: { variant: [colour], specs: [pick('Connection', WIRELESS, { highlight: hl }), f('Compatible', 'Windows, macOS'), f('Battery')] },
};

/** For a category with no form of its own: a colour and free rows. */
export const GENERIC_SPEC_TEMPLATE: SpecTemplate = { variant: [colour], specs: [] };

/** The form for a sub-category, else its main category's, else the generic one. */
export function specTemplateFor(slug?: string | null, parentSlug?: string | null): SpecTemplate {
  return (slug && SPEC_TEMPLATES[slug]) || (parentSlug && SPEC_TEMPLATES[parentSlug]) || GENERIC_SPEC_TEMPLATE;
}

/**
 * Turns the form into what the catalog stores: `variant`, `specs` (plus the free rows) and up to four highlights
 * (`key_specs`). Blank values are left out.
 */
export function buildSpecPatch(template: SpecTemplate, values: Record<string, string | undefined>, extra: SpecRow[] = []) {
  const filled = (fields: SpecField[]) => fields.map((fd) => [fd, (values[fd.key] ?? '').trim()] as const).filter(([, v]) => v);
  const variantPairs = filled(template.variant);
  const specPairs = filled(template.specs);
  const variant: Record<string, string> = Object.fromEntries(variantPairs.map(([fd, v]) => [fd.key, v]));
  const specs: Record<string, string> = Object.fromEntries(specPairs.map(([fd, v]) => [fd.key, v]));
  for (const row of extra) {
    const k = row.k.trim();
    const v = row.v.trim();
    if (k && v) specs[k] = v;
  }
  const key_specs = [...specPairs, ...variantPairs]
    .filter(([fd]) => fd.highlight)
    .map(([fd, v]) => fd.highlight!.replace('{v}', v))
    .slice(0, 4);
  return { variant, specs, key_specs };
}
