
"use strict";


const state = { points: [], survey: [], manholes: [], segments: [], results: null };

const KOSOVAREF01_WKT = 'PROJCS["KOSOVAREF01 / Balkans zone 7",GEOGCS["KOSOVAREF01",DATUM["Kosovo_Reference_System_2001",SPHEROID["GRS 1980",6378137,298.257222101]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433],AUTHORITY["EPSG","9140"]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",21],PARAMETER["scale_factor",0.9999],PARAMETER["false_easting",7500000],PARAMETER["false_northing",0],UNIT["metre",1],AXIS["Easting",EAST],AXIS["Northing",NORTH],AUTHORITY["EPSG","9141"]]';

function gisXY(point) {
  // Shapefile geometry order is always Easting, Northing.
  return $("coordinateOrder").value === "NE"
    ? [point.y, point.x]
    : [point.x, point.y];
}

function ensureKosovarefProjection() {
  if (typeof proj4 === "undefined") {
    throw new Error("Biblioteka e transformimit koordinativ nuk u ngarkua. Kontrolloni internetin.");
  }

  // KOSOVAREF01 / Balkans zone 7, compatible with EPSG:9141 parameters.
  proj4.defs("EPSG:9141",
    "+proj=tmerc +lat_0=0 +lon_0=21 +k=0.9999 +x_0=7500000 +y_0=0 " +
    "+ellps=GRS80 +units=m +no_defs +type=crs");
}

function parseKmlCoordinates(text) {
  const xml = new DOMParser().parseFromString(text, "application/xml");
  const parserError = xml.querySelector("parsererror");
  if (parserError) throw new Error("KML nuk është valid.");

  const paths = [];

  // Standard KML LineString
  xml.querySelectorAll("LineString coordinates").forEach(node => {
    const coords = node.textContent.trim().split(/\s+/).map(item => {
      const values = item.split(",").map(Number);
      return { lon: values[0], lat: values[1], alt: Number.isFinite(values[2]) ? values[2] : null };
    }).filter(c => Number.isFinite(c.lon) && Number.isFinite(c.lat));
    if (coords.length >= 2) paths.push(coords);
  });

  // Google Earth gx:Track
  const trackNodes = Array.from(xml.getElementsByTagNameNS("*", "Track"));
  trackNodes.forEach(track => {
    const coordNodes = Array.from(track.getElementsByTagNameNS("*", "coord"));
    const coords = coordNodes.map(node => {
      const values = node.textContent.trim().split(/\s+/).map(Number);
      return { lon: values[0], lat: values[1], alt: Number.isFinite(values[2]) ? values[2] : null };
    }).filter(c => Number.isFinite(c.lon) && Number.isFinite(c.lat));
    if (coords.length >= 2) paths.push(coords);
  });

  if (!paths.length) {
    throw new Error("Në KML nuk u gjet asnjë Path/LineString me së paku dy pika.");
  }

  // Use the longest path if several are present.
  paths.sort((a, b) => b.length - a.length);
  return paths[0];
}

function kmlToProjectPoints(kmlCoords) {
  ensureKosovarefProjection();

  const step = Math.max(1, Number($("kmlSampling").value) || 1);
  const fallbackZ = Number($("defaultKmlElevation").value) || 0;

  const sampled = kmlCoords.filter((_, i) => i % step === 0);
  if (sampled.at(-1) !== kmlCoords.at(-1)) sampled.push(kmlCoords.at(-1));

  let missingAltitudeCount = 0;

  const points = sampled.map((c, i) => {
    const [easting, northing] = proj4("EPSG:4326", "EPSG:9141", [c.lon, c.lat]);

    // Në Google Earth Path, Z=0 zakonisht do të thotë se terreni nuk është ruajtur.
    const hasUsableAltitude = Number.isFinite(c.alt) && Math.abs(c.alt) > 0.001;
    if (!hasUsableAltitude) missingAltitudeCount++;

    return {
      id: `KML-${String(i + 1).padStart(4, "0")}`,
      x: northing,
      y: easting,
      z: hasUsableAltitude ? c.alt : fallbackZ,
      longitude: c.lon,
      latitude: c.lat,
      originalAltitude: Number.isFinite(c.alt) ? c.alt : null,
      elevationSource: hasUsableAltitude ? "KML" : "MISSING",
      description: "Importuar nga Google Earth KML"
    };
  });

  return { points, missingAltitudeCount };
}

const $ = id => document.getElementById(id);
const num = id => Number($(id).value);

function message(text, type="success"){ $("messages").innerHTML = `<div class="${type}">${text}</div>`; }
function escapeHtml(v){ return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])); }
function formatChainage(m){ const km=Math.floor(m/1000), rem=m-km*1000; return `${km}+${rem.toFixed(2).padStart(6,"0")}`; }
function showTab(id){ document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t.dataset.tab===id)); document.querySelectorAll(".tab-content").forEach(c=>c.classList.toggle("active",c.id===id)); }

function samplePoints(){
  state.points = [
    {id:"T-01",x:7469000,y:4698500,z:374.20,description:"Fillimi"},
    {id:"T-02",x:7469038.5,y:4698470.4,z:373.75,description:"Kthesë"},
    {id:"T-03",x:7469082,y:4698441.2,z:372.90,description:"Trase"},
    {id:"T-04",x:7469131.7,y:4698412.6,z:372.10,description:"Trase"},
    {id:"T-05",x:7469180.4,y:4698374.2,z:371.20,description:"Shkarkimi"}
  ];
  renderPoints(); updateImportStats();
}
function addPoint(){
  const p=state.points.at(-1);
  state.points.push({id:`T-${String(state.points.length+1).padStart(2,"0")}`,x:p?p.x+20:0,y:p?p.y-10:0,z:p?p.z-.2:0,description:""});
  renderPoints(); updateImportStats();
}
function updateImportStats(){ $("importStats").innerHTML = `<div class="success">${state.points.length.toLocaleString()} pika të ngarkuara.</div>`; }

function renderPoints(){
  const body=$("pointsTable").querySelector("tbody"); body.innerHTML="";
  const limit=Math.min(state.points.length,500);
  for(let i=0;i<limit;i++){
    const p=state.points[i], tr=document.createElement("tr");
    tr.innerHTML=`<td>${i+1}</td>
      <td><input data-i="${i}" data-k="id" value="${escapeHtml(p.id)}"></td>
      <td><input data-i="${i}" data-k="x" type="number" step="0.01" value="${p.x}"></td>
      <td><input data-i="${i}" data-k="y" type="number" step="0.01" value="${p.y}"></td>
      <td><input data-i="${i}" data-k="z" type="number" step="0.01" value="${p.z}"></td>
      <td><input data-i="${i}" data-k="description" value="${escapeHtml(p.description||"")}"></td>
      <td><button class="danger ghost del" data-i="${i}">Fshi</button></td>`;
    body.appendChild(tr);
  }
  body.querySelectorAll("input").forEach(inp=>inp.addEventListener("change",e=>{
    const i=+e.target.dataset.i,k=e.target.dataset.k;
    state.points[i][k]=["x","y","z"].includes(k)?Number(e.target.value):e.target.value;
  }));
  body.querySelectorAll(".del").forEach(b=>b.addEventListener("click",e=>{state.points.splice(+e.target.dataset.i,1);renderPoints();updateImportStats();}));
}

function tokenize(line){
  const trimmed=line.trim();
  if(!trimmed) return [];
  if(trimmed.includes("\t")) return trimmed.split("\t").map(s=>s.trim()).filter(Boolean);
  if(trimmed.includes(";")) return trimmed.split(";").map(s=>s.trim());
  if(trimmed.includes(",")) return trimmed.split(",").map(s=>s.trim());
  return trimmed.split(/\s+/);
}
function parsePointsFile(text){
  const rows=text.replace(/^\uFEFF/,"").split(/\r?\n/).filter(r=>r.trim()&&!r.trim().startsWith("#"));
  const pts=[]; let start=0;
  if(rows[0] && /(^|[\s,;\t])(x|east|easting)([\s,;\t]|$)/i.test(rows[0]) && /(^|[\s,;\t])(y|north|northing)([\s,;\t]|$)/i.test(rows[0])) start=1;
  for(let i=start;i<rows.length;i++){
    const c=tokenize(rows[i]).map(v=>v.replace(/^"|"$/g,""));
    if(c.length<3) continue;
    let id,x,y,z,description="";
    if(c.length>=4 && Number.isFinite(Number(c[1])) && Number.isFinite(Number(c[2])) && Number.isFinite(Number(c[3]))){
      [id,x,y,z]=[c[0],Number(c[1]),Number(c[2]),Number(c[3])]; description=c.slice(4).join(" ");
    }else if(Number.isFinite(Number(c[0]))&&Number.isFinite(Number(c[1]))&&Number.isFinite(Number(c[2]))){
      id=`T-${String(pts.length+1).padStart(4,"0")}`; [x,y,z]=[Number(c[0]),Number(c[1]),Number(c[2])]; description=c.slice(3).join(" ");
    }else continue;
    if([x,y,z].every(Number.isFinite)) pts.push({id:id||`T-${pts.length+1}`,x,y,z,description});
  }
  if(pts.length<2) throw new Error("Nuk u gjetën së paku dy pika valide në fajll.");
  return pts;
}


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchTerrainElevations(points) {
  const targets = points
    .map((p, index) => ({ p, index }))
    .filter(item =>
      Number.isFinite(item.p.latitude) &&
      Number.isFinite(item.p.longitude) &&
      (!Number.isFinite(item.p.z) || Math.abs(item.p.z) <= 0.001 || item.p.elevationSource === "MISSING")
    );

  if (!targets.length) return { updated: 0, failed: 0 };

  const batchSize = 100;
  let updated = 0;
  let failed = 0;

  for (let start = 0; start < targets.length; start += batchSize) {
    const batch = targets.slice(start, start + batchSize);
    const latitudes = batch.map(item => item.p.latitude.toFixed(7)).join(",");
    const longitudes = batch.map(item => item.p.longitude.toFixed(7)).join(",");

    $("elevationProgress").innerHTML =
      `<div class="success">Duke marrë kuotat: ${Math.min(start + batch.length, targets.length)} / ${targets.length} pika...</div>`;

    const url =
      `https://api.open-meteo.com/v1/elevation?latitude=${encodeURIComponent(latitudes)}` +
      `&longitude=${encodeURIComponent(longitudes)}`;

    let success = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        if (!Array.isArray(data.elevation) || data.elevation.length !== batch.length) {
          throw new Error("Përgjigje jo e plotë nga shërbimi i kuotave.");
        }

        batch.forEach((item, i) => {
          const z = Number(data.elevation[i]);
          if (Number.isFinite(z)) {
            item.p.z = z;
            item.p.terrainElevation = z;
            item.p.elevationSource = "Copernicus DEM / Open-Meteo";
            updated++;
          } else {
            failed++;
          }
        });

        success = true;
        break;
      } catch (error) {
        if (attempt === 3) {
          console.error("Elevation batch failed:", error);
          failed += batch.length;
        } else {
          await sleep(700 * attempt);
        }
      }
    }

    // Shmang ngarkesën e tepërt për shumë pika.
    if (start + batchSize < targets.length) await sleep(150);
  }

  $("elevationProgress").innerHTML =
    `<div class="${failed ? "error" : "success"}">Kuotat u plotësuan për ${updated} pika.${failed ? ` Dështuan ${failed} pika.` : ""}</div>`;

  return { updated, failed };
}

function calculateProject(){
  try{
    if(state.points.length<2) throw new Error("Shtoni së paku dy pika.");
    const p={population:num("population"),designYears:num("designYears"),growthRate:num("growthRate"),consumption:num("consumption"),
      returnCoefficient:num("returnCoefficient"),peakCoefficient:num("peakCoefficient"),infiltration:num("infiltration"),
      maxDistance:num("maxManholeDistance"),minimumCover:num("minimumCover"),designSlope:num("designSlope"),
      minimumDiameter:num("minimumDiameter"),manningN:num("manningN")};
    state.survey=Calc.buildSurveyGeometry(state.points);
    const designPopulation=Calc.populationProjection(p.population,p.growthRate,p.designYears);
    const flow=Calc.designFlowLps(designPopulation,p.consumption,p.returnCoefficient,p.peakCoefficient,p.infiltration);
    state.manholes=Calc.generateManholes(state.points,p.maxDistance,p.minimumCover,p.designSlope);
    state.segments=Calc.generateSegments(state.manholes,flow,p.manningN,p.minimumDiameter);
    state.results={params:p,designPopulation,flow,totalLength:state.survey.at(-1).chainage};
    renderResults(); Drawing.drawPlan($("planSvg"),state.points,state.manholes); Drawing.drawProfile($("profileSvg"),state.survey,state.manholes);
    message(`U analizuan ${state.points.length.toLocaleString()} pika. DN nominal u zgjodh automatikisht për çdo segment.`);
    showTab("resultsTab");
  }catch(e){ message(e.message,"error"); }
}
function renderResults(){
  const r=state.results;
  $("summaryCards").innerHTML=`<div class="card"><span>Popullsia projektuese</span><strong>${Math.round(r.designPopulation)}</strong></div>
  <div class="card"><span>Q projektuese</span><strong>${r.flow.toFixed(2)} l/s</strong></div>
  <div class="card"><span>Gjatësia</span><strong>${r.totalLength.toFixed(2)} m</strong></div>
  <div class="card"><span>Pusetat</span><strong>${state.manholes.length}</strong></div>`;
  $("manholesTable").querySelector("tbody").innerHTML=state.manholes.map(m=>`<tr><td>${m.id}</td><td>${formatChainage(m.chainage)}</td><td>${m.x.toFixed(2)}</td><td>${m.y.toFixed(2)}</td><td>${m.z.toFixed(2)}</td><td>${m.invert.toFixed(2)}</td><td>${m.depth.toFixed(2)}</td></tr>`).join("");
  $("segmentsTable").querySelector("tbody").innerHTML=state.segments.map(s=>`<tr><td>${s.id}</td><td>${s.length.toFixed(2)}</td><td>${s.slope.toFixed(3)}</td><td><strong>DN ${s.dn}</strong></td><td>${s.capacity.toFixed(2)}</td><td>${s.flow.toFixed(2)}</td><td class="${s.status==="Në rregull"?"status-ok":"status-bad"}">${s.status}</td></tr>`).join("");
}

function download(content,name,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}

function normalizedEN(point){
  const [easting,northing]=gisXY(point);
  return {easting,northing};
}
function safeFileName(name){
  return String(name||"projekt-kanalizimi").trim().replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,"")||"projekt-kanalizimi";
}
function csvCell(value){
  const text=String(value??"");
  return /[",\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;
}
function xmlEscape(value){
  return String(value??"").replace(/[<>&"']/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&apos;"}[c]));
}
function dxfText(value){return String(value??"").replace(/[\r\n]+/g," ").replace(/[^\x20-\x7EÀ-ž]/g,"?");}

function exportStakeoutCsv(useInvert=false){
  if(!state.results||!state.manholes.length) return message("Gjeneroni projektin para eksportit për piketim.","error");
  const rows=state.manholes.map((m,i)=>{
    const {easting,northing}=normalizedEN(m);
    const elevation=useInvert?m.invert:m.z;
    const desc=useInvert
      ? `${m.id} FUND; CH=${m.chainage.toFixed(2)}m; Zterren=${m.z.toFixed(3)}; thellesi=${m.depth.toFixed(3)}`
      : `${m.id} TERREN; CH=${m.chainage.toFixed(2)}m; Zfund=${m.invert.toFixed(3)}; thellesi=${m.depth.toFixed(3)}`;
    // Civil 3D format: P,N,E,Z,D (comma delimited). Point number is numeric; manhole ID is kept in description.
    return [i+1,northing.toFixed(3),easting.toFixed(3),elevation.toFixed(3),desc].map(csvCell).join(",");
  });
  const base=safeFileName($("projectName").value);
  const suffix=useInvert?"pusetat-Z-fundi-PNEZD.csv":"pusetat-Z-terreni-PNEZD.csv";
  download(rows.join("\r\n"),`${base}-${suffix}`,"text/csv;charset=utf-8");
  message(`CSV për piketim u krijua me ${state.manholes.length} puseta (${useInvert?"Z fundi":"Z terreni"}).`);
}

function exportGeoJson3D(){
  if(!state.results) return message("Gjeneroni projektin para eksportit GeoJSON 3D.","error");
  const features=[];
  state.manholes.forEach((m,i)=>{
    const {easting,northing}=normalizedEN(m);
    features.push({type:"Feature",properties:{feature_type:"manhole",id:m.id,point_no:i+1,chainage_m:m.chainage,ground_z:m.z,invert_z:m.invert,depth_m:m.depth,crs:$("projectCrs").value},geometry:{type:"Point",coordinates:[easting,northing,m.invert]}});
  });
  state.segments.forEach((s,i)=>{
    const a=state.manholes[i],b=state.manholes[i+1],ae=normalizedEN(a),be=normalizedEN(b);
    features.push({type:"Feature",properties:{feature_type:"pipe",id:s.id,length_m:s.length,slope_pct:s.slope,dn_mm:s.dn,q_lps:s.flow,capacity_lps:s.capacity,status:s.status,crs:$("projectCrs").value},geometry:{type:"LineString",coordinates:[[ae.easting,ae.northing,a.invert],[be.easting,be.northing,b.invert]]}});
  });
  const geojson={type:"FeatureCollection",name:"sewer_design_3d",crs:{type:"name",properties:{name:$("projectCrs").value}},features};
  download(JSON.stringify(geojson,null,2),`${safeFileName($("projectName").value)}-3D.geojson`,"application/geo+json");
  message("GeoJSON 3D u krijua me koordinata Easting, Northing dhe Z fundi.");
}

function exportDxf3D(){
  if(!state.results||state.manholes.length<2) return message("Gjeneroni projektin para eksportit DXF.","error");
  const out=[];
  const add=(code,value)=>{out.push(String(code),String(value));};
  add(0,"SECTION");add(2,"HEADER");
  add(9,"$ACADVER");add(1,"AC1027");
  add(9,"$INSUNITS");add(70,6); // metres
  add(0,"ENDSEC");
  add(0,"SECTION");add(2,"TABLES");
  add(0,"TABLE");add(2,"LAYER");add(70,4);
  [["KANAL_AKSI_3D",1],["PUSETA_TERREN",3],["PUSETA_FUND",5],["ETIKETA",7]].forEach(([name,color])=>{add(0,"LAYER");add(2,name);add(70,0);add(62,color);add(6,"CONTINUOUS");});
  add(0,"ENDTAB");add(0,"ENDSEC");
  add(0,"SECTION");add(2,"ENTITIES");

  // Exact design invert as a 3D polyline.
  add(0,"POLYLINE");add(8,"KANAL_AKSI_3D");add(66,1);add(70,8);add(10,0);add(20,0);add(30,0);
  state.manholes.forEach(m=>{const {easting,northing}=normalizedEN(m);add(0,"VERTEX");add(8,"KANAL_AKSI_3D");add(10,easting.toFixed(4));add(20,northing.toFixed(4));add(30,m.invert.toFixed(4));add(70,32);});
  add(0,"SEQEND");add(8,"KANAL_AKSI_3D");

  state.manholes.forEach(m=>{
    const {easting,northing}=normalizedEN(m);
    add(0,"POINT");add(8,"PUSETA_TERREN");add(10,easting.toFixed(4));add(20,northing.toFixed(4));add(30,m.z.toFixed(4));
    add(0,"POINT");add(8,"PUSETA_FUND");add(10,easting.toFixed(4));add(20,northing.toFixed(4));add(30,m.invert.toFixed(4));
    add(0,"TEXT");add(8,"ETIKETA");add(10,(easting+0.75).toFixed(4));add(20,(northing+0.75).toFixed(4));add(30,m.z.toFixed(4));add(40,0.8);add(1,dxfText(`${m.id}  CH ${m.chainage.toFixed(2)}  ZT ${m.z.toFixed(2)}  ZF ${m.invert.toFixed(2)}`));
  });
  add(0,"ENDSEC");add(0,"EOF");
  download(out.join("\r\n"),`${safeFileName($("projectName").value)}-Civil3D-3D.dxf`,"application/dxf");
  message("DXF 3D u krijua: aksi në Z fundi, pikat e terrenit, pikat e fundit dhe etiketat.");
}

function exportProfileDxf2D(){
  if(!state.results||state.survey.length<2||state.manholes.length<2){
    return message("Gjeneroni projektin para eksportit të profilit DXF.","error");
  }

  const out=[];
  const add=(code,value)=>{out.push(String(code),String(value));};
  const total=state.results.totalLength;
  const allZ=[...state.survey.map(p=>p.z),...state.manholes.map(m=>m.invert)];
  let zmin=Math.min(...allZ),zmax=Math.max(...allZ);
  const zPad=Math.max(0.5,(zmax-zmin)*0.12);
  zmin-=zPad; zmax+=zPad;

  // Profili përdor stacionazhen në boshtin X dhe ekzagjerim grafik në boshtin Y.
  const plotWidth=Math.max(total,100);
  const plotHeight=plotWidth*0.45;
  const sx=plotWidth/Math.max(total,0.001);
  const sy=plotHeight/Math.max(zmax-zmin,0.001);
  const X=ch=>ch*sx;
  const Y=z=>(z-zmin)*sy;
  const textH=Math.max(0.8,plotWidth/150);
  const tick=Math.max(1.5,plotWidth/80);

  function dxfLine(layer,color,x1,y1,x2,y2){
    add(0,"LINE");add(8,layer);add(62,color);
    add(10,x1.toFixed(4));add(20,y1.toFixed(4));add(30,0);
    add(11,x2.toFixed(4));add(21,y2.toFixed(4));add(31,0);
  }
  function dxfTextEntity(layer,color,x,y,height,value,rotation=0,center=false){
    add(0,"TEXT");add(8,layer);add(62,color);
    add(10,x.toFixed(4));add(20,y.toFixed(4));add(30,0);
    add(40,height.toFixed(4));add(1,dxfText(value));add(50,rotation);
    if(center){add(72,1);add(11,x.toFixed(4));add(21,y.toFixed(4));add(31,0);}
  }
  function dxfPolyline(layer,color,points){
    add(0,"POLYLINE");add(8,layer);add(62,color);add(66,1);add(70,0);
    add(10,0);add(20,0);add(30,0);
    points.forEach(p=>{add(0,"VERTEX");add(8,layer);add(10,p[0].toFixed(4));add(20,p[1].toFixed(4));add(30,0);add(70,0);});
    add(0,"SEQEND");add(8,layer);
  }
  function dxfCircle(layer,color,x,y,r){
    add(0,"CIRCLE");add(8,layer);add(62,color);
    add(10,x.toFixed(4));add(20,y.toFixed(4));add(30,0);add(40,r.toFixed(4));
  }

  add(0,"SECTION");add(2,"HEADER");
  add(9,"$ACADVER");add(1,"AC1009");
  add(9,"$INSUNITS");add(70,6);
  add(0,"ENDSEC");
  add(0,"SECTION");add(2,"TABLES");
  add(0,"TABLE");add(2,"LAYER");add(70,7);
  [["KORNIZA",8],["GRID",9],["TERRENI",3],["FUNDI_GYPIT",4],["PUSETAT",1],["TEXT",7],["0",7]].forEach(([name,color])=>{
    add(0,"LAYER");add(2,name);add(70,0);add(62,color);add(6,"CONTINUOUS");
  });
  add(0,"ENDTAB");add(0,"ENDSEC");
  add(0,"SECTION");add(2,"ENTITIES");

  // Korniza, rrjeti dhe vlerat e akseve.
  dxfLine("KORNIZA",8,0,0,plotWidth,0);
  dxfLine("KORNIZA",8,plotWidth,0,plotWidth,plotHeight);
  dxfLine("KORNIZA",8,plotWidth,plotHeight,0,plotHeight);
  dxfLine("KORNIZA",8,0,plotHeight,0,0);
  for(let i=0;i<=10;i++){
    const ch=total*i/10,x=X(ch);
    dxfLine("GRID",9,x,0,x,plotHeight);
    dxfTextEntity("TEXT",8,x,-2.4*textH,textH,ch.toFixed(1),0,true);
  }
  for(let i=0;i<=8;i++){
    const z=zmin+(zmax-zmin)*i/8,y=Y(z);
    dxfLine("GRID",9,0,y,plotWidth,y);
    dxfTextEntity("TEXT",8,-1.3*textH,y-0.35*textH,textH,z.toFixed(2),0,false);
  }

  dxfPolyline("TERRENI",3,state.survey.map(p=>[X(p.chainage),Y(p.z)]));
  dxfPolyline("FUNDI_GYPIT",4,state.manholes.map(m=>[X(m.chainage),Y(m.invert)]));
  state.manholes.forEach(m=>{
    const x=X(m.chainage),yi=Y(m.invert);
    dxfLine("PUSETAT",1,x,Y(m.z),x,yi);
    dxfCircle("FUNDI_GYPIT",4,x,yi,textH*0.35);
    dxfTextEntity("TEXT",7,x,-4.5*textH,textH,m.id,0,true);
    dxfTextEntity("TEXT",7,x,-6.1*textH,textH,`CH ${m.chainage.toFixed(2)}`,0,true);
  });

  dxfTextEntity("TEXT",4,0,plotHeight+5.5*textH,2.2*textH,"Profili gjatesor");
  dxfTextEntity("TEXT",7,plotWidth/2,-8.8*textH,1.25*textH,"Stacionazha [m]",0,true);
  dxfTextEntity("TEXT",7,-6.0*textH,plotHeight/2,1.25*textH,"Kuota [m]",90,true);
  dxfLine("TERRENI",3,plotWidth-30*tick,plotHeight+2.1*textH,plotWidth-23*tick,plotHeight+2.1*textH);
  dxfTextEntity("TEXT",7,plotWidth-22*tick,plotHeight+1.7*textH,textH,"Terreni");
  dxfLine("FUNDI_GYPIT",4,plotWidth-14*tick,plotHeight+2.1*textH,plotWidth-7*tick,plotHeight+2.1*textH);
  dxfTextEntity("TEXT",7,plotWidth-6*tick,plotHeight+1.7*textH,textH,"Fundi i gypit");

  add(0,"ENDSEC");add(0,"EOF");
  download(out.join("\r\n"),`${safeFileName($("projectName").value)}-Profili-gjatesor-2D.dxf`,"application/dxf");
  message("Profili DXF u krijua me polivija, vija, rrjet dhe tekste të integruara në fajll.");
}

function exportLandXml(){
  if(!state.results||state.manholes.length<2) return message("Gjeneroni projektin para eksportit LandXML.","error");
  const projectName=xmlEscape($("projectName").value);
  const alignmentName=xmlEscape(`${$("projectName").value} - Aksi`);
  const total=state.results.totalLength;
  const coordGeom=state.manholes.slice(1).map((b,i)=>{
    const a=state.manholes[i],ae=normalizedEN(a),be=normalizedEN(b);
    return `<Line dir="0" length="${(b.chainage-a.chainage).toFixed(4)}"><Start>${ae.northing.toFixed(4)} ${ae.easting.toFixed(4)}</Start><End>${be.northing.toFixed(4)} ${be.easting.toFixed(4)}</End></Line>`;
  }).join("");
  const cgPoints=state.manholes.map((m,i)=>{const e=normalizedEN(m);return `<CgPoint name="${xmlEscape(m.id)}" desc="Manhole; CH=${m.chainage.toFixed(2)}; ZF=${m.invert.toFixed(3)}; Depth=${m.depth.toFixed(3)}">${e.northing.toFixed(4)} ${e.easting.toFixed(4)} ${m.z.toFixed(4)}</CgPoint>`;}).join("");
  const groundPvis=state.survey.map(p=>`<PVI>${p.chainage.toFixed(4)} ${p.z.toFixed(4)}</PVI>`).join("");
  const invertPvis=state.manholes.map(m=>`<PVI>${m.chainage.toFixed(4)} ${m.invert.toFixed(4)}</PVI>`).join("");
  const xml=`<?xml version="1.0" encoding="UTF-8"?>\n<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2" version="1.2" date="${new Date().toISOString().slice(0,10)}" time="${new Date().toTimeString().slice(0,8)}" language="English" readOnly="false">\n  <Units><Metric areaUnit="squareMeter" linearUnit="meter" volumeUnit="cubicMeter" temperatureUnit="celsius" pressureUnit="milliBars" diameterUnit="millimeter" angularUnit="decimal degrees" directionUnit="decimal degrees"/></Units>\n  <Project name="${projectName}" desc="Sewer design; CRS ${xmlEscape($("projectCrs").value)}"/>\n  <Application name="SewerDesign Pro Advanced" version="4" manufacturer="Local web application"/>\n  <CgPoints>${cgPoints}</CgPoints>\n  <Alignments name="Sewer Alignments">\n    <Alignment name="${alignmentName}" length="${total.toFixed(4)}" staStart="0.0000" desc="CRS ${xmlEscape($("projectCrs").value)}">\n      <CoordGeom>${coordGeom}</CoordGeom>\n      <Profile name="Terreni ekzistues" desc="Existing ground profile"><ProfAlign name="Terreni ekzistues">${groundPvis}</ProfAlign></Profile>\n      <Profile name="Kuota fundi kanalit" desc="Designed sewer invert profile"><ProfAlign name="Kuota fundi kanalit">${invertPvis}</ProfAlign></Profile>\n    </Alignment>\n  </Alignments>\n</LandXML>`;
  download(xml,`${safeFileName($("projectName").value)}-Civil3D.xml`,"application/xml");
  message("LandXML u krijua me Alignment, profil terreni, profil të fundit dhe COGO points të pusetave.");
}

function projectObject(){return {version:3,projectName:$("projectName").value,crs:$("projectCrs").value,coordinateOrder:$("coordinateOrder").value,inputs:Object.fromEntries(["population","designYears","growthRate","consumption","returnCoefficient","peakCoefficient","infiltration","maxManholeDistance","minimumCover","designSlope","minimumDiameter","manningN"].map(id=>[id,$(id).value])),points:state.points,manholes:state.manholes,segments:state.segments,results:state.results};}
function saveLocal(){localStorage.setItem("sewerDesignProjectV2",JSON.stringify(projectObject()));message("Projekti u ruajt lokalisht.");}
function loadLocal(){const p=JSON.parse(localStorage.getItem("sewerDesignProjectV2"));if(!p)return message("Nuk u gjet projekt i ruajtur.","error");$("projectName").value=p.projectName||"";$("projectCrs").value=p.crs||"EPSG:9141"; $("coordinateOrder").value=p.coordinateOrder||"NE";Object.entries(p.inputs||{}).forEach(([k,v])=>{$(k).value=v});state.points=p.points||[];renderPoints();updateImportStats();calculateProject();}
function exportJson(){download(JSON.stringify(projectObject(),null,2),"sewer-project.json","application/json");}
function exportCsv(){if(!state.segments.length)return message("Gjeneroni projektin.","error");const rows=[["Segmenti","Gjatesia_m","Pjerresia_pct","DN_nominal_mm","Kapaciteti_lps","Q_lps","Statusi"],...state.segments.map(s=>[s.id,s.length.toFixed(2),s.slope.toFixed(3),s.dn,s.capacity.toFixed(2),s.flow.toFixed(2),s.status])];download(rows.map(r=>r.join(",")).join("\n"),"segmentet.csv","text/csv");}

function exportPdf(){
  if(!state.results) return message("Gjeneroni projektin para PDF-së.","error");
  const parts=[...document.querySelectorAll(".pdf-part:checked")].map(x=>x.value);
  const w=window.open("","_blank");
  const profileSvg=new XMLSerializer().serializeToString($("profileSvg"));
  const summary=`<h1>${escapeHtml($("projectName").value)}</h1><p><b>CRS:</b> ${escapeHtml($("projectCrs").value)}</p>
  <p><b>Popullsia projektuese:</b> ${Math.round(state.results.designPopulation)} &nbsp; <b>Q:</b> ${state.results.flow.toFixed(2)} l/s &nbsp; <b>Gjatësia:</b> ${state.results.totalLength.toFixed(2)} m</p>`;
  const mhRows=state.manholes.map(m=>`<tr><td>${m.id}</td><td>${formatChainage(m.chainage)}</td><td>${m.z.toFixed(2)}</td><td>${m.invert.toFixed(2)}</td><td>${m.depth.toFixed(2)}</td></tr>`).join("");
  const sgRows=state.segments.map(s=>`<tr><td>${s.id}</td><td>${s.length.toFixed(2)}</td><td>${s.slope.toFixed(3)}</td><td>DN ${s.dn}</td><td>${s.capacity.toFixed(2)}</td></tr>`).join("");
  w.document.write(`<html><head><title>${escapeHtml($("projectName").value)}</title><style>body{font-family:Arial;padding:24px;color:#111}table{width:100%;border-collapse:collapse;margin:12px 0 24px}th,td{border:1px solid #999;padding:6px;font-size:11px}h1,h2{color:#084d60}svg{width:100%;height:auto}.page{page-break-before:always}@media print{button{display:none}}</style></head><body>
    ${parts.includes("summary")?summary:""}
    ${parts.includes("profile")?`<div class="page"><h2>Profili gjatësor</h2>${profileSvg}</div>`:""}
    ${parts.includes("manholes")?`<div class="page"><h2>Pusetat</h2><table><tr><th>ID</th><th>Stacionazha</th><th>Z terreni</th><th>Z fundi</th><th>Thellësia</th></tr>${mhRows}</table></div>`:""}
    ${parts.includes("segments")?`<div class="page"><h2>Segmentet</h2><table><tr><th>Segmenti</th><th>Gjatësia</th><th>Pjerrësia</th><th>DN nominal</th><th>Kapaciteti</th></tr>${sgRows}</table></div>`:""}
    <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

function manholesGeoJSON(){
  return {type:"FeatureCollection",name:"pusetat",crs:{type:"name",properties:{name:$("projectCrs").value}},features:state.manholes.map(m=>({type:"Feature",properties:{id:m.id,chainage:m.chainage,ground_z:m.z,invert_z:m.invert,depth_m:m.depth},geometry:{type:"Point",coordinates:gisXY(m)}}))};
}
function linesGeoJSON(){
  return {type:"FeatureCollection",name:"segmentet",crs:{type:"name",properties:{name:$("projectCrs").value}},features:state.segments.map((s,i)=>{const a=state.manholes[i],b=state.manholes[i+1];return {type:"Feature",properties:{id:s.id,length_m:s.length,slope_pct:s.slope,dn_mm:s.dn,q_lps:s.flow,capacity:s.capacity,status:s.status},geometry:{type:"LineString",coordinates:[gisXY(a),gisXY(b)]}}})};
}
async function exportShape(kind){
  if(!state.results) return message("Gjeneroni projektin para eksportit GIS.","error");
  if(typeof shpwrite==="undefined") return message("Biblioteka Shapefile nuk u ngarkua. Kontrolloni internetin.","error");

  const gj = kind === "points" ? manholesGeoJSON() : linesGeoJSON();
  const filename = kind === "points" ? "pusetat" : "segmentet";

  try {
    message("Shapefile po krijohet...", "success");

    const options = {
      folder: filename,
      filename: filename,
      prj: KOSOVAREF01_WKT,
      outputType: "blob",
      compression: "STORE",
      types: {
        point: "pusetat",
        polyline: "segmentet",
        polygon: "poligonet"
      }
    };

    const result = await shpwrite.zip(gj, options);
    const blob = result instanceof Blob
      ? result
      : new Blob([result], { type: "application/zip" });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    message(`${filename}.zip u krijua me sukses.`, "success");
  } catch(e) {
    console.error(e);
    message("Eksporti Shapefile dështoi: " + e.message, "error");
  }
}

document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".tab").forEach(t=>t.onclick=()=>showTab(t.dataset.tab));
  $("btnSample").onclick=()=>{samplePoints();message("Shembulli u ngarkua.");};
  $("btnAddPoint").onclick=addPoint;
  $("btnClearPoints").onclick=()=>{state.points=[];renderPoints();updateImportStats();};
  $("btnCalculate").onclick=calculateProject;
  $("btnSave").onclick=saveLocal;
  $("btnLoad").onclick=loadLocal;
  $("btnExportProject").onclick=exportJson;
  $("btnExportCsv").onclick=exportCsv;
  $("btnExportProfile").onclick=()=>Drawing.downloadSvg($("profileSvg"),"profili-gjatesor.svg");
  $("btnExportProfileDxf").onclick=exportProfileDxf2D;
  $("btnPdf").onclick=exportPdf;
  $("btnStakeoutGround").onclick=()=>exportStakeoutCsv(false);
  $("btnStakeoutInvert").onclick=()=>exportStakeoutCsv(true);
  $("btnExportDxf3D").onclick=exportDxf3D;
  $("btnExportLandXml").onclick=exportLandXml;
  $("btnExportGeoJson3D").onclick=exportGeoJson3D;
  $("btnShapeManholes").onclick=()=>exportShape("points");
  $("btnShapeLines").onclick=()=>exportShape("lines");
  $("btnNew").onclick=()=>location.reload();
  $("pointsFile").onchange=async e=>{try{const f=e.target.files[0];if(!f)return;state.points=parsePointsFile(await f.text());renderPoints();updateImportStats();message(`U importuan ${state.points.length.toLocaleString()} pika dhe të gjitha do të analizohen.`);}catch(err){message(err.message,"error");}};

  $("kmlFile").onchange = async e => {
    try {
      const file = e.target.files[0];
      if (!file) return;

      $("elevationProgress").innerHTML = `<div class="success">Duke lexuar KML-në...</div>`;

      const kmlCoords = parseKmlCoordinates(await file.text());
      const converted = kmlToProjectPoints(kmlCoords);

      state.points = converted.points;
      $("coordinateOrder").value = "NE";
      $("projectCrs").value = "EPSG:9141";

      if (converted.missingAltitudeCount > 0 && $("autoFetchElevation").checked) {
        message(
          `KML kishte ${converted.missingAltitudeCount} pika me Z=0. Po merren automatikisht kuotat e terrenit...`,
          "success"
        );

        const elevationResult = await fetchTerrainElevations(state.points);

        if (elevationResult.updated === 0) {
          throw new Error("Nuk u mor asnjë kuotë terreni. Kontrolloni lidhjen me internetin.");
        }
      }

      renderPoints();
      updateImportStats();
      Drawing.drawPlan($("planSvg"), state.points, []);

      const unresolved = state.points.filter(p => !Number.isFinite(p.z) || Math.abs(p.z) <= 0.001).length;
      if (unresolved > 0) {
        message(
          `KML u importua, por ${unresolved} pika vazhdojnë me Z=0. Mos bëni projektim pa i plotësuar kuotat.`,
          "error"
        );
      } else {
        message(
          `KML u importua me ${state.points.length.toLocaleString()} pika. Të gjitha pikat kanë kuotë dhe projekti është gati për gjenerim.`,
          "success"
        );
      }
    } catch (err) {
      $("elevationProgress").innerHTML = "";
      message("Importi KML dështoi: " + err.message, "error");
    }
  };

  samplePoints(); Drawing.drawPlan($("planSvg"),state.points,[]); Drawing.drawProfile($("profileSvg"),[],[]);
});
