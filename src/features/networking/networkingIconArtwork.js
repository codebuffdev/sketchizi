const blue = "#2563a6";
const pale = "#eaf3ff";
const glyphs = {
  router: '<rect x="13" y="23" width="38" height="24" rx="4"/><path d="M20 35h9m-4-4 4 4-4 4M44 35h-9m4-4-4 4 4 4"/>',
  switch: '<rect x="10" y="18" width="44" height="29" rx="4"/><path d="M17 26h5v5h-5zM26 26h5v5h-5zM35 26h5v5h-5zM44 26h5v5h-5zM17 38h5v4h-5zM26 38h5v4h-5zM35 38h5v4h-5zM44 38h5v4h-5z"/>',
  firewall: '<path d="M32 8 49 15v13c0 12-7 20-17 27C22 48 15 40 15 28V15z"/><path d="M22 22h20M22 30h20M27 22v8M36 22v8M22 38h20"/>',
  'load-balancer': '<rect x="23" y="8" width="18" height="13" rx="3"/><rect x="6" y="43" width="15" height="12" rx="2"/><rect x="25" y="43" width="15" height="12" rx="2"/><rect x="44" y="43" width="15" height="12" rx="2"/><path d="M32 21v10M13 43V35h38v8M32 31 13 35M32 31l19 4"/>',
  'reverse-proxy': '<circle cx="12" cy="19" r="5"/><circle cx="12" cy="45" r="5"/><rect x="25" y="22" width="17" height="20" rx="3"/><rect x="49" y="11" width="10" height="12" rx="2"/><rect x="49" y="40" width="10" height="12" rx="2"/><path d="M17 19h8v9M17 45h8v-9M42 28h7M42 36h7"/>',
  dns: '<circle cx="32" cy="12" r="7"/><circle cx="15" cy="47" r="7"/><circle cx="49" cy="47" r="7"/><path d="M29 19 18 40M35 19l11 21M22 47h20"/><text x="32" y="30" text-anchor="middle" font-size="9" fill="#2563a6" stroke="none">DNS</text>',
  cdn: '<circle cx="32" cy="32" r="10"/><circle cx="10" cy="14" r="5"/><circle cx="54" cy="14" r="5"/><circle cx="10" cy="50" r="5"/><circle cx="54" cy="50" r="5"/><path d="M24 25 14 17M40 25l10-8M24 39l-10 8M40 39l10 8"/>',
  vpn: '<path d="M8 22h12l7 10-7 10H8M56 22H44l-7 10 7 10h12"/><path d="M22 32h20M28 26l-6 6 6 6M36 26l6 6-6 6"/><rect x="26" y="8" width="12" height="10" rx="2"/><path d="M29 8V6a3 3 0 0 1 6 0v2"/>',
  'nat-gateway': '<rect x="20" y="20" width="24" height="24" rx="4"/><path d="M5 27h13m-5-5 5 5-5 5M59 37H46m5-5-5 5 5 5M32 5v12m-5-5 5 5 5-5M32 59V47m-5 5 5-5 5 5"/>',
  'internet-gateway': '<circle cx="32" cy="32" r="22"/><path d="M10 32h44M32 10c9 8 9 36 0 44M32 10c-9 8-9 36 0 44M5 32h10m34 0h10M32 5v10m0 34v10"/><path d="M32 32h19m-6-6 6 6-6 6"/>',
  'vpc-vnet': '<rect x="7" y="9" width="50" height="46" rx="5" stroke-dasharray="3 3"/><rect x="18" y="19" width="28" height="26" rx="3"/><circle cx="25" cy="27" r="3"/><circle cx="39" cy="37" r="3"/><path d="m28 29 8 6"/>',
  subnet: '<rect x="7" y="9" width="50" height="46" rx="5"/><path d="M32 10v44M8 32h23M33 22h23M33 43h23"/><circle cx="19" cy="20" r="3"/><circle cx="44" cy="32" r="3"/><circle cx="43" cy="47" r="3"/>',
  network: '<circle cx="32" cy="32" r="6"/><circle cx="12" cy="15" r="5"/><circle cx="52" cy="15" r="5"/><circle cx="12" cy="49" r="5"/><circle cx="52" cy="49" r="5"/><path d="m27 28-11-9m21 9 11-9M27 36l-11 9m21-9 11 9"/>',
  endpoint: '<circle cx="32" cy="32" r="20"/><circle cx="32" cy="32" r="8"/><path d="M32 4v8M32 52v8M4 32h8M52 32h8"/><circle cx="32" cy="32" r="2" fill="#2563a6"/>'
};
export function networkingIconSvg(resourceType) {
  const glyph = glyphs[resourceType] || glyphs.network;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g fill="${pale}" stroke="${blue}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">${glyph}</g></svg>`;
}
export function networkingCanvasGlyph(resourceType, x, y, groupId, resource) {
  const raw = [];
  const add = (type, px, py, width, height, extra = {}) => raw.push({ type, x: px, y: py, width, height, strokeColor: blue, backgroundColor: pale, fillStyle: "solid", strokeWidth: 2.5, roughness: 0, groupIds: [groupId], customData: { diagramIcon: true, networkingResource: resource, networkingResourcePart: "glyph" }, ...extra });
  const line = (x1, y1, x2, y2, extra = {}) => { const lx=Math.min(x1,x2),ly=Math.min(y1,y2); add("line",lx,ly,Math.abs(x2-x1),Math.abs(y2-y1),{points:[[x1-lx,y1-ly],[x2-lx,y2-ly]],backgroundColor:"transparent",...extra}); };
  const box = (a,b,c,d,extra={}) => add("rectangle",x+a,y+b,c,d,extra);
  const circle = (a,b,d,extra={}) => add("ellipse",x+a,y+b,d,d,extra);
  // Compact, editable Excalidraw-native glyphs; the visual language matches the catalog SVGs.
  switch(resourceType) {
    case "router": box(102,18,76,34,{roundness:{type:3}}); line(x+112,y+35,x+140,y+35,{endArrowhead:"triangle"}); line(x+168,y+35,x+140,y+35,{startArrowhead:"triangle"}); break;
    case "switch": box(95,17,90,38); for(let i=0;i<4;i++) box(102+i*19,25,12,8); for(let i=0;i<4;i++) box(102+i*19,40,12,8); break;
    case "firewall": add("diamond",x+110,y+12,60,48,{fillStyle:"solid"}); for(let i=0;i<3;i++) line(x+119,y+25+i*10,x+161,y+25+i*10); break;
    case "load-balancer": box(116,10,48,20); for(let i=0;i<3;i++){box(88+i*34,48,25,17);line(x+140,y+30,x+100+i*34,y+48,{endArrowhead:"triangle"});} break;
    case "reverse-proxy": circle(91,23,16); box(117,18,46,29); for(let i=0;i<2;i++) box(178,10+i*35,20,17); line(x+107,y+31,x+117,y+31,{endArrowhead:"triangle"}); line(x+163,y+27,x+178,y+18,{endArrowhead:"triangle"}); line(x+163,y+38,x+178,y+45,{endArrowhead:"triangle"}); break;
    case "dns": circle(128,6,24); circle(94,47,18); circle(168,47,18); line(x+133,y+29,x+107,y+47); line(x+147,y+29,x+177,y+47); line(x+112,y+56,x+168,y+56); break;
    case "cdn": circle(126,20,28); [[91,8],[174,8],[91,50],[174,50]].forEach(([a,b])=>circle(a,b,12)); line(x+130,y+25,x+103,y+17);line(x+150,y+25,x+180,y+17);line(x+130,y+43,x+103,y+55);line(x+150,y+43,x+180,y+55);break;
    case "vpn": box(105,18,70,30); line(x+83,y+33,x+105,y+33,{endArrowhead:"triangle"});line(x+175,y+33,x+197,y+33,{endArrowhead:"triangle"}); add("text",x+121,y+23,38,18,{text:"VPN",fontSize:13,strokeColor:blue,backgroundColor:"transparent",textAlign:"center"});break;
    case "nat-gateway": box(117,18,46,30); line(x+85,y+33,x+117,y+33,{endArrowhead:"triangle"});line(x+163,y+33,x+195,y+33,{endArrowhead:"triangle"});line(x+140,y+7,x+140,y+18,{endArrowhead:"triangle"});line(x+140,y+48,x+140,y+60,{endArrowhead:"triangle"});break;
    case "internet-gateway": circle(112,10,56); line(x+84,y+38,x+112,y+38,{endArrowhead:"triangle"});line(x+168,y+38,x+196,y+38,{endArrowhead:"triangle"});line(x+140,y+10,x+140,y+66);break;
    case "vpc-vnet": add("rectangle",x+86,y+7,108,58,{strokeStyle:"dashed",backgroundColor:"transparent",roundness:{type:3}});box(112,21,56,31);circle(119,27,7);circle(151,38,7);line(x+126,y+31,x+153,y+41);break;
    case "subnet": add("rectangle",x+86,y+7,108,58,{backgroundColor:"transparent",roundness:{type:3}});line(x+140,y+8,x+140,y+64);line(x+87,y+36,x+139,y+36);circle(104,17,9);circle(156,44,9);break;
    case "network": circle(131,25,18);circle(94,8,12);circle(174,8,12);circle(94,49,12);circle(174,49,12);line(x+131,y+29,x+106,y+18);line(x+149,y+29,x+177,y+18);line(x+131,y+39,x+106,y+53);line(x+149,y+39,x+177,y+53);break;
    case "endpoint": circle(116,10,48);circle(130,24,20);line(x+140,y+2,x+140,y+10);line(x+140,y+58,x+140,y+66);line(x+108,y+34,x+116,y+34);line(x+164,y+34,x+172,y+34);break;
  }
  return raw;
}
