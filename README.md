# SewerDesign Pro Advanced

## Funksionet e reja
- Zgjedh automatikisht DN nominal nga seria: 160, 200, 250, 300, 315, 400, 500, 600, 800 dhe 1000 mm.
- Importon CSV ose TXT me presje, pikëpresje, tab ose hapësira.
- Mund të analizojë mbi 2,000 pika. Për performancë, tabela shfaq vetëm 500 rreshtat e parë.
- Krijon PDF përmes funksionit Print të shfletuesit; mund të zgjedhësh përmbledhjen, profilin, pusetat dhe segmentet.
- Eksporton pusetat dhe segmentet si Shapefile ZIP.
- Ruhet CRS/EPSG i deklaruar në projekt dhe në GeoJSON-in e përdorur për eksport.

## Formate të pranueshme TXT/CSV

Me ID:
```text
P1 7469000.00 4698500.00 374.20 Fillimi
P2 7469038.50 4698470.40 373.75 Kthese
```

Pa ID:
```text
7469000.00 4698500.00 374.20
7469038.50 4698470.40 373.75
```

Gjithashtu pranohen presje, pikëpresje dhe tab.

## PDF
Kliko “Ruaj pjesët e zgjedhura si PDF”, pastaj në dritaren Print zgjidh “Save as PDF”.

## Shapefile
Eksporti përdor bibliotekën `shp-write` nga CDN, prandaj kërkon internet. Shapefile ruan koordinatat X/Y pa transformim. Sigurohu që fusha EPSG të jetë e saktë dhe cakto të njëjtin CRS kur e hap në ArcGIS/QGIS.

## GitHub Pages
Ngarko të gjithë përmbajtjen e dosjes në root të repository-t dhe aktivizo Pages nga dega `main`.


## Korrigjimi FIXED
- U zëvendësua `shpwrite.download()` i vjetruar me `shpwrite.zip()` dhe shkarkim përmes Blob.
- U kalua te `@mapbox/shp-write 0.4.3`.
- U korrigjua emërtimi i pusetës së parë/fundit që të dalë `P-01`, `P-02`, etj.


## KOSOVAREF01 – korrigjimi i koordinatave
Ky version eksporton Shapefile në:

- **KOSOVAREF01 / Balkans zone 7**
- **EPSG:9141**
- Central meridian: 21°
- Scale factor: 0.9999
- False easting: 7,500,000 m
- Njësia: metër

Skedari `.prj` vendoset automatikisht brenda ZIP-it.

Për formatin e të dhënave ku:
- X ≈ 4,700,000 është Northing
- Y ≈ 7,450,000 është Easting

zgjidh:
`X = Northing, Y = Easting`

Shapefile-i shkruan gjeometrinë në rendin standard:
`[Easting, Northing]`.


## Importi nga Google Earth KML

Aplikacioni pranon një `.kml` që përmban:

- `LineString`
- `gx:Track`

Hapat:

1. Në Google Earth krijo ose zgjidh një Path.
2. Ruaje si `.kml`.
3. Në aplikacion, te “Import opsional nga Google Earth KML”, zgjidh fajllin.
4. Aplikacioni lexon koordinatat WGS84.
5. Koordinatat transformohen automatikisht në KOSOVAREF01 / EPSG:9141.
6. Pikat bëhen traseja hyrëse për projektim.
7. Kliko “Gjenero projektin”.

### Kuotat Z

Google Earth shpesh ruan:

- lartësi absolute;
- lartësi relative ndaj tokës;
- ose zero, varësisht nga mënyra si është krijuar Path-i.

Kur KML nuk ka Z valide, aplikacioni përdor vlerën te:
`Kuota kur mungon Z [m]`.

Për projektim real, kuotat e terrenit duhet të vijnë nga matjet gjeodezike ose nga një burim i verifikuar i terrenit.


## Ruajtja e kuotës nga KML

Në këtë version:

- `longitude` dhe `latitude` ruhen si koordinata origjinale të Google Earth;
- `Z` ruhet saktësisht si vlera e tretë e koordinatës KML;
- transformimi WGS84 → KOSOVAREF01 zbatohet vetëm në plan:
  - Easting
  - Northing
- kuota nuk transformohet, nuk korrigjohet dhe nuk rrumbullakohet;
- fusha `originalAltitude` ruan vlerën origjinale të KML-së për kontroll.

Vetëm kur një pikë nuk ka fare vlerë Z, përdoret kuota rezervë e vendosur nga përdoruesi.


## Kuotat automatike për KML me Z=0

Kur një Path i Google Earth ka koordinata të formës:

```text
longitude,latitude,0
```

aplikacioni:

1. ruan longitude/latitude;
2. identifikon pikat me Z=0;
3. i dërgon koordinatat në Open-Meteo Elevation API;
4. i përpunon në grupe prej maksimum 100 pikash;
5. merr kuotën nga Copernicus DEM GLO-90;
6. e vendos kuotën në fushën Z;
7. ruan burimin e kuotës në `elevationSource`;
8. vazhdon me profilin dhe projektimin.

Kuotat jo-zero që ekzistojnë në KML nuk mbishkruhen.

### Saktësia
Modeli është global me rezolucion rreth 90 m. Është i përshtatshëm për koncept/paraprojekt, por jo zëvendësim i matjeve gjeodezike për projekt zbatues.

## Eksportet e reja për GIS / AutoCAD Civil 3D

- **CSV piketimi – Z terreni (PNEZD):** renditja `Point, Northing, Easting, Elevation, Description`.
- **CSV piketimi – Z fundi (PNEZD):** koordinatat e njëjta, por Elevation është kuota projektuese e fundit të pusetës.
- **DXF 3D:** përmban aksin e kanalit si 3D Polyline në kuotën e fundit, pikat e terrenit, pikat e fundit dhe etiketat.
- **LandXML:** përmban Alignment, profilin e terrenit, profilin projektues të fundit dhe COGO points të pusetave.
- **GeoJSON 3D:** pusetat dhe segmentet me koordinata `[Easting, Northing, Z]`.

Në Civil 3D, CSV importohet me formatin **PNEZD (comma delimited)**. LandXML importohet nga **Insert > Import LandXML**. CRS i projektit është **EPSG:9141 / KOSOVAREF01**; caktojeni të njëjtin sistem koordinativ edhe në vizatimin Civil 3D.
