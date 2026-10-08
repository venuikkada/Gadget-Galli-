// Hyderabad zones and areas with pincodes and approximate centre coordinates.
// Admins can correct these in the admin panel (Areas page).

export const ZONES = [
  { id: 1, name: 'West Hyderabad', sort: 1 },
  { id: 2, name: 'Central Hyderabad', sort: 2 },
  { id: 3, name: 'Secunderabad & North', sort: 3 },
  { id: 4, name: 'East Hyderabad', sort: 4 },
  { id: 5, name: 'South Hyderabad', sort: 5 },
];

// [name, pincode, lat, lng, zoneId]
const RAW_AREAS = [
  // West
  ['Madhapur', '500081', 17.4483, 78.3915, 1],
  ['HITEC City', '500081', 17.4474, 78.3762, 1],
  ['Gachibowli', '500032', 17.4401, 78.3489, 1],
  ['Kondapur', '500084', 17.4633, 78.3637, 1],
  ['Kothaguda', '500084', 17.4580, 78.3740, 1],
  ['Kukatpally', '500072', 17.4948, 78.3996, 1],
  ['KPHB Colony', '500072', 17.4849, 78.3895, 1],
  ['Miyapur', '500049', 17.4968, 78.3614, 1],
  ['Hafeezpet', '500049', 17.4820, 78.3580, 1],
  ['Chandanagar', '500050', 17.4930, 78.3290, 1],
  ['Lingampally', '500019', 17.4925, 78.3170, 1],
  ['Nizampet', '500090', 17.5160, 78.3860, 1],
  ['Bachupally', '500090', 17.5480, 78.3640, 1],
  ['Manikonda', '500089', 17.4010, 78.3870, 1],
  ['Nanakramguda', '500032', 17.4140, 78.3420, 1],
  ['Jubilee Hills', '500033', 17.4325, 78.4071, 1],
  // Central
  ['Ameerpet', '500016', 17.4375, 78.4483, 2],
  ['Begumpet', '500016', 17.4447, 78.4664, 2],
  ['SR Nagar', '500038', 17.4410, 78.4420, 2],
  ['Erragadda', '500018', 17.4560, 78.4330, 2],
  ['Banjara Hills', '500034', 17.4138, 78.4398, 2],
  ['Somajiguda', '500082', 17.4240, 78.4580, 2],
  ['Panjagutta', '500082', 17.4260, 78.4500, 2],
  ['Khairatabad', '500004', 17.4120, 78.4600, 2],
  ['Lakdikapul', '500004', 17.4040, 78.4650, 2],
  ['Himayatnagar', '500029', 17.4010, 78.4870, 2],
  ['Basheerbagh', '500029', 17.4000, 78.4770, 2],
  ['Abids', '500001', 17.3920, 78.4760, 2],
  ['Nampally', '500001', 17.3880, 78.4690, 2],
  ['Koti', '500095', 17.3850, 78.4860, 2],
  ['Mehdipatnam', '500028', 17.3916, 78.4385, 2],
  ['Tolichowki', '500008', 17.3980, 78.4160, 2],
  ['Attapur', '500048', 17.3700, 78.4300, 2],
  // Secunderabad & North
  ['Secunderabad', '500003', 17.4399, 78.4983, 3],
  ['Marredpally', '500026', 17.4460, 78.5100, 3],
  ['Trimulgherry', '500015', 17.4710, 78.5100, 3],
  ['Bowenpally', '500011', 17.4700, 78.4840, 3],
  ['Malkajgiri', '500047', 17.4470, 78.5260, 3],
  ['Alwal', '500010', 17.5010, 78.5080, 3],
  ['Sainikpuri', '500094', 17.4870, 78.5490, 3],
  ['Kompally', '500014', 17.5350, 78.4850, 3],
  ['Tarnaka', '500017', 17.4280, 78.5280, 3],
  // East
  ['Uppal', '500039', 17.4058, 78.5591, 4],
  ['Habsiguda', '500007', 17.4180, 78.5430, 4],
  ['Nacharam', '500076', 17.4300, 78.5600, 4],
  ['Ramanthapur', '500013', 17.3970, 78.5370, 4],
  ['Boduppal', '500092', 17.4140, 78.5780, 4],
  ['ECIL', '500062', 17.4700, 78.5700, 4],
  // South
  ['Dilsukhnagar', '500060', 17.3688, 78.5247, 5],
  ['Chaitanyapuri', '500060', 17.3686, 78.5380, 5],
  ['Kothapet', '500035', 17.3680, 78.5520, 5],
  ['Saroornagar', '500035', 17.3530, 78.5340, 5],
  ['LB Nagar', '500074', 17.3457, 78.5522, 5],
  ['Vanasthalipuram', '500070', 17.3290, 78.5690, 5],
  ['Malakpet', '500036', 17.3730, 78.5080, 5],
  ['Charminar', '500002', 17.3616, 78.4747, 5],
  ['Rajendranagar', '500030', 17.3200, 78.4000, 5],
];

export const AREAS = RAW_AREAS.map(([name, pincode, lat, lng, zone_id], i) => ({
  id: i + 1,
  name,
  pincode,
  lat,
  lng,
  zone_id,
}));

export const areaByName = (name) => {
  const a = AREAS.find((x) => x.name === name);
  if (!a) throw new Error(`Unknown area ${name}`);
  return a;
};
export const zoneByName = (name) => {
  const z = ZONES.find((x) => x.name === name);
  if (!z) throw new Error(`Unknown zone ${name}`);
  return z;
};

// Categories: top level, then sub-categories. icon = MaterialCommunityIcons name.
export const CATEGORIES = [
  { slug: 'mobiles', name: 'Mobiles', te: 'మొబైల్స్', hi: 'मोबाइल', icon: 'cellphone', shop_type: 'mobiles', children: [
    { slug: 'smartphones', name: 'Smartphones', te: 'స్మార్ట్‌ఫోన్లు', hi: 'स्मार्टफ़ोन', icon: 'cellphone' },
    { slug: 'tablets', name: 'Tablets', te: 'టాబ్లెట్లు', hi: 'टैबलेट', icon: 'tablet' },
    { slug: 'smartwatches', name: 'Smartwatches', te: 'స్మార్ట్‌వాచ్‌లు', hi: 'स्मार्टवॉच', icon: 'watch' },
    { slug: 'earbuds', name: 'Earbuds & Headphones', te: 'ఇయర్‌బడ్స్', hi: 'ईयरबड्स', icon: 'headphones' },
    { slug: 'chargers', name: 'Chargers', te: 'ఛార్జర్లు', hi: 'चार्जर', icon: 'power-plug' },
    { slug: 'cables', name: 'Cables', te: 'కేబుల్స్', hi: 'केबल', icon: 'usb' },
    { slug: 'cases', name: 'Cases & Covers', te: 'కేసులు & కవర్లు', hi: 'केस और कवर', icon: 'cellphone-cog' },
    { slug: 'screen-guards', name: 'Screen Guards', te: 'స్క్రీన్ గార్డులు', hi: 'स्क्रीन गार्ड', icon: 'cellphone-screenshot' },
    { slug: 'power-banks', name: 'Power Banks', te: 'పవర్ బ్యాంకులు', hi: 'पावर बैंक', icon: 'battery-charging-high' },
  ] },
  { slug: 'cctv-security', name: 'CCTV & Security', te: 'సీసీటీవీ & సెక్యూరిటీ', hi: 'सीसीटीवी और सुरक्षा', icon: 'cctv', shop_type: 'cctv_security', children: [
    { slug: 'cctv-cameras', name: 'CCTV Cameras', te: 'సీసీటీవీ కెమెరాలు', hi: 'सीसीटीवी कैमरा', icon: 'cctv' },
    { slug: 'dvr-nvr', name: 'DVR / NVR', te: 'డీవీఆర్ / ఎన్వీఆర్', hi: 'डीवीआर / एनवीआर', icon: 'video-box' },
    { slug: 'surveillance-hdd', name: 'Surveillance Hard Disks', te: 'సర్వైలెన్స్ హార్డ్ డిస్క్‌లు', hi: 'सर्विलांस हार्ड डिस्क', icon: 'harddisk' },
    { slug: 'cctv-power', name: 'CCTV Power Supplies', te: 'పవర్ సప్లైలు', hi: 'पावर सप्लाई', icon: 'power-socket-uk' },
    { slug: 'cctv-cables', name: 'CCTV Cables', te: 'సీసీటీవీ కేబుల్స్', hi: 'सीसीटीवी केबल', icon: 'cable-data' },
    { slug: 'video-door-phones', name: 'Video Door Phones', te: 'వీడియో డోర్ ఫోన్లు', hi: 'वीडियो डोर फ़ोन', icon: 'doorbell-video' },
    { slug: 'cctv-kits', name: 'CCTV Kits', te: 'సీసీటీవీ కిట్లు', hi: 'सीसीटीवी किट', icon: 'cctv' },
    { slug: 'installation-service', name: 'Installation Service', te: 'ఇన్‌స్టాలేషన్ సర్వీస్', hi: 'इंस्टॉलेशन सेवा', icon: 'tools' },
  ] },
  { slug: 'laptops-computers', name: 'Laptops & Computers', te: 'ల్యాప్‌టాప్‌లు & కంప్యూటర్లు', hi: 'लैपटॉप और कंप्यूटर', icon: 'laptop', shop_type: 'computers_laptops', children: [
    { slug: 'laptops', name: 'Laptops', te: 'ల్యాప్‌టాప్‌లు', hi: 'लैपटॉप', icon: 'laptop' },
    { slug: 'desktops', name: 'Desktops', te: 'డెస్క్‌టాప్‌లు', hi: 'डेस्कटॉप', icon: 'desktop-tower' },
    { slug: 'all-in-ones', name: 'All-in-Ones', te: 'ఆల్-ఇన్-వన్', hi: 'ऑल-इन-वन', icon: 'desktop-mac' },
    { slug: 'monitors', name: 'Monitors', te: 'మానిటర్లు', hi: 'मॉनिटर', icon: 'monitor' },
  ] },
  { slug: 'components', name: 'Components', te: 'కాంపోనెంట్స్', hi: 'कंपोनेंट्स', icon: 'expansion-card', shop_type: 'components_peripherals', children: [
    { slug: 'graphics-cards', name: 'Graphics Cards', te: 'గ్రాఫిక్స్ కార్డులు', hi: 'ग्राफ़िक्स कार्ड', icon: 'expansion-card' },
    { slug: 'processors', name: 'Processors', te: 'ప్రాసెసర్లు', hi: 'प्रोसेसर', icon: 'cpu-64-bit' },
    { slug: 'motherboards', name: 'Motherboards', te: 'మదర్‌బోర్డులు', hi: 'मदरबोर्ड', icon: 'developer-board' },
    { slug: 'ram', name: 'RAM', te: 'ర్యామ్', hi: 'रैम', icon: 'memory' },
    { slug: 'storage', name: 'SSD & Hard Disks', te: 'ఎస్ఎస్‌డీ & హార్డ్ డిస్క్‌లు', hi: 'एसएसडी और हार्ड डिस्क', icon: 'harddisk' },
    { slug: 'psu', name: 'Power Supplies (PSU)', te: 'పవర్ సప్లైలు (PSU)', hi: 'पावर सप्लाई (PSU)', icon: 'power-plug-outline' },
    { slug: 'cabinets', name: 'Cabinets', te: 'క్యాబినెట్లు', hi: 'कैबिनेट', icon: 'server' },
    { slug: 'coolers', name: 'Coolers', te: 'కూలర్లు', hi: 'कूलर', icon: 'fan' },
  ] },
  { slug: 'peripherals', name: 'Peripherals', te: 'పెరిఫెరల్స్', hi: 'पेरिफेरल्स', icon: 'keyboard', shop_type: 'components_peripherals', children: [
    { slug: 'keyboards', name: 'Keyboards', te: 'కీబోర్డులు', hi: 'कीबोर्ड', icon: 'keyboard' },
    { slug: 'mice', name: 'Mice', te: 'మౌస్‌లు', hi: 'माउस', icon: 'mouse' },
    { slug: 'headsets', name: 'Headsets', te: 'హెడ్‌సెట్లు', hi: 'हेडसेट', icon: 'headset' },
    { slug: 'webcams', name: 'Webcams', te: 'వెబ్‌క్యామ్‌లు', hi: 'वेबकैम', icon: 'webcam' },
    { slug: 'printers', name: 'Printers', te: 'ప్రింటర్లు', hi: 'प्रिंटर', icon: 'printer' },
    { slug: 'routers', name: 'Routers', te: 'రౌటర్లు', hi: 'राउटर', icon: 'router-wireless' },
    { slug: 'ups', name: 'UPS', te: 'యూపీఎస్', hi: 'यूपीएस', icon: 'battery-high' },
    { slug: 'speakers', name: 'Speakers', te: 'స్పీకర్లు', hi: 'स्पीकर', icon: 'speaker' },
  ] },
];

export const SYNONYMS = [
  ['gpu', 'graphics card', 'vga', 'video card'],
  ['mobile', 'phone', 'smartphone', 'cell phone'],
  ['cc camera', 'cctv', 'cctv camera', 'security camera', 'surveillance camera'],
  ['laptop', 'notebook'],
  ['processor', 'cpu'],
  ['ram', 'memory'],
  ['ssd', 'solid state drive'],
  ['hdd', 'hard disk', 'hard drive'],
  ['psu', 'power supply', 'smps'],
  ['cabinet', 'case', 'pc case'],
  ['earbuds', 'tws', 'earphones', 'airpods'],
  ['power bank', 'powerbank'],
  ['charger', 'adapter', 'adaptor'],
  ['tempered glass', 'screen guard', 'screen protector'],
  ['wifi router', 'router', 'wi fi router'],
  ['dvr', 'recorder'],
  ['door phone', 'video door phone', 'video doorbell'],
  ['monitor', 'display', 'screen'],
  ['ups', 'inverter ups', 'power backup'],
];
