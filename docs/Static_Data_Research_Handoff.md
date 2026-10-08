# Jejak Static Data Research Handoff

## Purpose

Collect prepared, non-user-triggered data from official or trusted online
sources and deliver it as spreadsheet sheets for import into Jejak's Supabase
PostgreSQL database. The same handoff also delivers the map files (boundaries,
building and population grids, transit) that the ETL turns into heatmap cells.

This document covers **static datasets only**. Do not collect current job
vacancies, live housing listings, company offices, or company-level employment
claims. Those belong to the dynamic zone evidence discovery flow.

## Spreadsheet rules

- Use one workbook with the sheets listed below.
- Use the exact lowercase `snake_case` column names shown.
- Dates use `YYYY-MM-DD`.
- Academic years use `2025/2026`.
- Rates use decimals: `0.067` means `6.7%`.
- Money is numeric IDR without `Rp`, periods, or commas.
- Use `TRUE` and `FALSE` for booleans.
- Leave unknown values blank. Do not use `N/A`, `-`, or invented values.
- Use stable lowercase codes for regions, institutions, and sectors.
- Use complete `https://` URLs.
- `source_name` supports up to 255 characters in Supabase; include enough
  detail to identify the publisher, release, and table when available.
- Preserve the original source file and page/table reference for audit.
- Record each value only for the region the source publishes it for. See
  [Geographic levels](#geographic-levels).
- Examples below use `is_sample = TRUE`. Real validated uploads use `FALSE`.

Common provenance columns for statistical sheets:

```text
period_start, period_end, source_name, source_url, published_at,
retrieved_at, evidence_type, confidence, limitations, is_sample
```

Allowed `evidence_type` values:

```text
observed, estimated, derived, unavailable
```

## Geographic levels

A figure belongs to the region the source table reports. Never copy a city or
province figure into kecamatan or kelurahan rows, and never split one across
them. When a statistic only exists for the city, record it once on the city row;
the app shows it as city-level context.

Check each table's stated level. The usual lowest levels are:

| Data | Usual lowest level | Typical source |
|---|---|---|
| Population, households, density | Kelurahan | Kecamatan Dalam Angka, Dukcapil |
| Labor force, unemployment, sector employment | City (kota) | BPS Sakernas (August round) |
| Wages | Province or city, as the table states | BPS Sakernas |
| Minimum wage | Province (DKI Jakarta sets one UMP, no UMK) | Pemprov DKI Jakarta |
| Household expenditure | City | BPS Susenas |
| Consumer price index, inflation | Province (Jakarta is one CPI area) | BPS |
| Education, health, and transport facility counts | Kelurahan | Podes, Kecamatan Dalam Angka, Dapodik, Kemenkes |
| Enrollment | Institution, campus, or program | PDDikti |

If a source seems to report a smaller area than this table, record the exact
table name and check that the figure was measured there, not allocated from a
larger area.

## Database destination summary

| Sheet | Database table | Import behavior |
|---|---|---|
| `regions` | `public.regions` | One row becomes one region; workbook columns are present alongside internal IDs and legacy read aliases |
| `population` | `public.population` | One row preserves all population measures and their shared provenance |
| `labor_force` | `public.labor_force` | One row preserves all labor-force measures and sample details |
| `sector_employment` | `public.sector_employment` | One row per region, KBLI section, reporting period, and source |
| `wages_income` | `public.wages_income` | One row preserves the wage and income measures reported together |
| `institutions` | `public.institutions` | One row becomes one institution; workbook columns coexist with internal IDs and legacy read aliases |
| `campuses` | `public.campuses` | One row becomes one campus, identified by its OSM identity when available |
| `student_enrollment` | `public.student_enrollment` | One row becomes one institution/campus/program enrollment observation |
| `education_facilities` | `public.education_facilities` | One row preserves education facility counts and provenance |
| `healthcare_facilities` | `public.healthcare_facilities` | One row preserves healthcare facility counts and provenance |
| `transport_infrastructure` | `public.transport_infrastructure` | One row preserves transport values and provenance |
| `public_places` | `public.public_places` | One row becomes one public place |
| `housing_statistics` | `public.housing_statistics` | One row per region, housing type, reporting period, and source |
| `cost_of_living` | `public.cost_of_living` | One row preserves cost and price-index measures with shared provenance |
| `sector_mapping` | `public.sector_mapping` | Reference rows link KBLI codes to Jejak sector IDs |
| `geospatial_sources` + `map_data/` files | `public.geospatial_sources`, then `regions`, `region_data`, and `places` | The ETL records each source, loads boundaries, generates grid cells, and computes per-cell values |
| `estimation_parameters` | `public.estimation_parameters` | Reference rows provide low/high inputs to the ETL's office-worker estimate |

The sheet-backed database tables use the sheet's exact column names. `id` columns
are internal database keys; `regions` and `institutions` also retain synchronized
legacy aliases for existing RPCs. Statistical rows are stored wide in their
matching tables. The map API exposes them as one metric per fact and includes the
source, period, sample marker, and housing-type/KBLI dimension where applicable.
The separate `region_data` table remains for ETL-generated grid facts and older
application data; it is not the import target for workbook statistics.

## 1. Regions

**Sheet:** `regions`  
**Database:** `public.regions`

### Columns

```text
region_code
region_name
region_type
parent_region_code
kemendagri_code
bps_code
source_name
source_updated_at
is_supported
```

### Example rows

| region_code | region_name | region_type | parent_region_code | kemendagri_code | bps_code | source_name | source_updated_at | is_supported |
|---|---|---|---|---|---|---|---|---|
| indonesia | Indonesia | country |  |  |  | BIG | | TRUE |
| dki-jakarta | DKI Jakarta | province | indonesia | 31 |  | BIG | | TRUE |
| jakarta-selatan | Jakarta Selatan | city | dki-jakarta | 31.74 |  | BIG | | TRUE |
| setiabudi | Setiabudi | district | jakarta-selatan | 31.74.02 |  | BIG | | TRUE |
| setiabudi-karet-kuningan | Karet Kuningan | neighborhood | setiabudi | 31.74.02.1003 |  | BIG | | TRUE |

Allowed region types: `country`, `province`, `regency`, `city`, `district`,
`neighborhood`, `grid`, `metro`. A kota administrasi is a `city`, a kecamatan a
`district`, and a kelurahan a `neighborhood`.

- `kemendagri_code` is the official Kemendagri region code with dots, as BIG
  publishes it (`KDCPUM` for kecamatan, `KDEPUM` for kelurahan). It is required
  for every province, city, district, and neighborhood row.
- `bps_code` is the BPS region code. Fill it when a BPS table you deliver uses
  it. BIG's layers usually leave it empty, and BPS codes differ from Kemendagri
  codes in DKI Jakarta.
- `regions` stores both official-code columns. `kemendagri_code` is required for
  the administrative rows listed above; leave `bps_code` blank unless the BPS
  source you deliver provides it.
- Kelurahan names repeat across kecamatan, so prefix a neighborhood code with its
  district code (`setiabudi-karet-kuningan`).
- Boundaries do not go in this sheet. Deliver them as map files (section 16).
- Do not list grid cells. The ETL generates them.

## 2. Population and demographics

**Sheet:** `population`  
**Database:** `public.population`

### Columns

```text
region_code
population
male_population
female_population
working_age_population
households
population_density
urban_population
rural_population
period_start
period_end
source_name
source_url
published_at
retrieved_at
evidence_type
confidence
limitations
is_sample
```

### Example row

| region_code | population | male_population | female_population | working_age_population | households | population_density | period_end | source_name | evidence_type | confidence | is_sample |
|---|---:|---:|---:|---:|---:|---:|---|---|---|---:|---|
| pancoran | 96000 | 48200 | 47800 | 71000 | 28400 | 11200 | 2025-12-31 | BPS Kecamatan Dalam Angka | observed | 1.0000 | TRUE |

Import one wide row to `public.population` for each region, source, and reporting
period. The map API exposes each populated value (`population`, `households`,
`population_density`, and so on) as a separate fact. Kecamatan and kelurahan
rows are both welcome when the source reports them.

## 3. Labor force and unemployment

**Sheet:** `labor_force`  
**Database:** `public.labor_force`

### Columns

```text
region_code
labor_force
employed_people
unemployed_people
unemployment_rate
labor_force_participation_rate
working_age_population
period_start
period_end
source_name
source_url
published_at
retrieved_at
evidence_type
sample_size
confidence
limitations
is_sample
```

### Example row

| region_code | labor_force | employed_people | unemployed_people | unemployment_rate | labor_force_participation_rate | working_age_population | period_end | source_name | evidence_type | is_sample |
|---|---:|---:|---:|---:|---:|---:|---|---|---|---|
| jakarta-selatan | 1200000 | 1130000 | 70000 | 0.058 | 0.660 | 1820000 | 2025-08-31 | BPS Sakernas | observed | TRUE |

Sakernas is representative only down to city level. Do not create kecamatan or
kelurahan labor-force rows from it.

## 4. Sector employment

**Sheet:** `sector_employment`  
**Database:** `public.sector_employment`

### Columns

```text
region_code
kbli_2020_code
kbli_2020_name
employed_people
employment_percentage
period_start
period_end
source_name
source_url
published_at
retrieved_at
evidence_type
sample_size
confidence
limitations
is_sample
```

### Example row

| region_code | kbli_2020_code | kbli_2020_name | employed_people | employment_percentage | period_end | source_name | evidence_type | confidence | is_sample |
|---|---|---|---:|---:|---|---|---|---:|---|
| jakarta-selatan | j | Informasi dan Komunikasi | 95000 | 0.084 | 2025-08-31 | BPS Sakernas | observed | 0.9500 | TRUE |

Use the KBLI 2020 section that the source table reports, as a lowercase letter
from `a` to `u`, with the section name exactly as the table prints it. If the
table merges sections, join the letters with underscores (`d_e`). Do not invent
Jejak-specific sector codes here; `sector_mapping` (section 15) links KBLI
sections to Jejak sectors.

The map API exposes metrics such as `employed_people:kbli_j` and
`employment_percentage:kbli_j`, retaining `kbli_2020_code = j` as the fact
dimension. The source sheet remains one row per region and KBLI section.

## 5. Wages and income

**Sheet:** `wages_income`  
**Database:** `public.wages_income`

### Columns

```text
region_code
average_monthly_wage_idr
median_monthly_wage_idr
minimum_wage_idr
median_household_income_idr
average_household_expenditure_idr
period_start
period_end
source_name
source_url
published_at
retrieved_at
evidence_type
sample_size
confidence
limitations
is_sample
```

### Example row

| region_code | average_monthly_wage_idr | median_monthly_wage_idr | minimum_wage_idr | median_household_income_idr | average_household_expenditure_idr | period_end | source_name | evidence_type | is_sample |
|---|---:|---:|---:|---:|---:|---|---|---|---|
| jakarta-selatan | 7200000 | 6500000 |  | 10500000 | 8200000 | 2025-12-31 | BPS | observed | TRUE |

DKI Jakarta sets one provincial minimum wage (UMP). Record it on the
`dki-jakarta` row, not on each city.

## 6. Institutions

**Sheet:** `institutions`  
**Database:** `public.institutions`

### Columns

```text
institution_code
institution_name
institution_type
website
source_name
source_url
is_active
```

### Example row

| institution_code | institution_name | institution_type | website | source_name | source_url | is_active |
|---|---|---|---|---|---|---|
| universitas-contoh | Universitas Contoh | university | https://university.example.id | PDDikti | https://example.kemdikbud.go.id/institution | TRUE |

Allowed types: `university`, `polytechnic`, `school`, `training_provider`,
`other`.

## 7. Campuses

**Sheet:** `campuses`  
**Database:** `public.campuses`

### Columns

```text
institution_code
region_code
campus_name
osm_type
osm_id
osm_tags
latitude
longitude
address
website
phone
operator
source_name
source_url
observed_at
is_active
```

### Example row

| institution_code | region_code | campus_name | osm_type | osm_id | latitude | longitude | address | website | source_name | observed_at | is_active |
|---|---|---|---|---:|---:|---:|---|---|---|---|---|
| universitas-contoh | pancoran | Universitas Contoh Kampus Pancoran | node | 123456789 | -6.245 | 106.845 | Pancoran, Jakarta Selatan | https://university.example.id | OpenStreetMap | 2026-09-01 | TRUE |

## 8. Student enrollment

**Sheet:** `student_enrollment`  
**Database:** `public.student_enrollment`

### Columns

```text
institution_code
campus_osm_type
campus_osm_id
metric
student_count
data_scope
program_code
program_name
academic_year
period_start
period_end
source_name
source_url
published_at
retrieved_at
evidence_type
confidence
limitations
is_sample
```

### Example institution-wide row

| institution_code | campus_osm_type | campus_osm_id | metric | student_count | data_scope | program_code | program_name | academic_year | source_name | source_url | evidence_type | is_sample |
|---|---|---:|---|---:|---|---|---|---|---|---|---|---|
| universitas-contoh |  |  | enrolled_students | 28500 | institution |  |  | 2025/2026 | PDDikti | https://example.kemdikbud.go.id/enrollment | observed | TRUE |

Allowed metrics:

```text
enrolled_students, active_students, new_student_intake, graduates,
international_students, program_enrollment
```

Allowed scopes: `institution`, `campus`, `program`, `unknown`.

Do not copy an institution-wide total into every campus row. Campus-local
enrollment requires campus-specific evidence.

## 9. Education facilities

**Sheet:** `education_facilities`  
**Database:** `public.education_facilities`

### Columns

```text
region_code
schools
vocational_schools
universities
polytechnics
training_centers
public_schools
private_schools
period_start
period_end
source_name
source_url
retrieved_at
evidence_type
confidence
limitations
is_sample
```

### Example row

| region_code | schools | vocational_schools | universities | polytechnics | training_centers | public_schools | private_schools | period_end | source_name | evidence_type | is_sample |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|
| pancoran | 41 | 6 | 1 | 0 | 4 | 18 | 23 | 2025-12-31 | Kemendikbud | observed | TRUE |

## 10. Healthcare facilities

**Sheet:** `healthcare_facilities`  
**Database:** `public.healthcare_facilities`

### Columns

```text
region_code
hospitals
public_hospitals
private_hospitals
health_centers
clinics
pharmacies
hospital_beds
period_start
period_end
source_name
source_url
retrieved_at
evidence_type
confidence
limitations
is_sample
```

### Example row

| region_code | hospitals | public_hospitals | private_hospitals | health_centers | clinics | pharmacies | hospital_beds | period_end | source_name | evidence_type | is_sample |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|
| pancoran | 4 | 1 | 3 | 2 | 18 | 25 | 620 | 2025-12-31 | Ministry of Health | observed | TRUE |

## 11. Transport infrastructure

**Sheet:** `transport_infrastructure`  
**Database:** `public.transport_infrastructure`

### Columns

```text
region_code
public_transport_stops
train_stations
bus_stations
transit_stations
airport_count
port_count
road_length_km
period_start
period_end
source_name
source_url
retrieved_at
evidence_type
confidence
limitations
is_sample
```

### Example row

| region_code | public_transport_stops | train_stations | bus_stations | transit_stations | airport_count | port_count | road_length_km | period_end | source_name | evidence_type | is_sample |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|
| pancoran | 22 | 2 | 1 | 3 | 0 | 0 | 86.4 | 2025-12-31 | Satu Data Jakarta | observed | TRUE |

These are counts per region. Individual stops and stations belong in
`public_places`, or, for a whole city, in the transit map files (section 16).

## 12. Public places

**Sheet:** `public_places`  
**Database:** `public.public_places`

### Columns

```text
region_code
institution_code
place_name
category
osm_type
osm_id
osm_tags
latitude
longitude
address
operator
website
phone
source_name
source_url
observed_at
is_active
```

### Example row

| region_code | institution_code | place_name | category | osm_type | osm_id | latitude | longitude | address | operator | source_name | observed_at | is_active |
|---|---|---|---|---|---:|---:|---:|---|---|---|---|---|
| pancoran |  | Halte Pancoran | transit_stop | node | 987654321 | -6.243 | 106.844 | Pancoran, Jakarta Selatan | TransJakarta | OpenStreetMap | 2026-09-01 | TRUE |

Allowed categories: `campus`, `transit_stop`, `station`, `hospital`,
`public_facility`, `other`. Use this sheet for hand-checked places. Deliver
hundreds of stops as an OSM extract or GTFS feed in `map_data/` instead of
typing rows.

### Getting OSM data

Pick the tool by volume:

| Need | Tool | Output |
|---|---|---|
| Up to a few hundred hand-checked rows for this sheet | [Overpass Turbo](https://overpass-turbo.eu) | Export as GeoJSON or CSV |
| Bulk extracts for `map_data/` (buildings, transit) | [Geofabrik Java extract](https://download.geofabrik.de/asia/indonesia/java.html), filtered with `osmium tags-filter` | `.osm.pbf` |
| A drawn area without writing queries | [HOT Export Tool](https://export.hotosm.org) | GeoPackage or Shapefile |

This Overpass query returns every category for DKI Jakarta:

```text
[out:json][timeout:120];
area["ISO3166-2"="ID-JK"]->.jkt;
(
  nwr["amenity"="hospital"](area.jkt);
  nwr["amenity"~"^(university|college)$"](area.jkt);
  nwr["railway"~"^(station|halt)$"](area.jkt);
  nwr["public_transport"="station"](area.jkt);
  nwr["highway"="bus_stop"](area.jkt);
  nwr["public_transport"="platform"]["bus"="yes"](area.jkt);
  nwr["amenity"~"^(library|townhall|community_centre|police)$"](area.jkt);
  nwr["leisure"="park"](area.jkt);
);
out center tags;
```

If the area returns nothing, replace the `area` line with
`area["name"="Daerah Khusus Ibukota Jakarta"]["admin_level"="4"]->.jkt;`.

Map OSM tags to categories:

| `category` | OSM tags |
|---|---|
| `campus` | `amenity=university`, `amenity=college`. Put these in `campuses` (section 7), not here |
| `station` | `railway=station`, `railway=halt`, `public_transport=station` (MRT, LRT, KRL) |
| `transit_stop` | `highway=bus_stop`, `public_transport=platform` with `bus=yes` (TransJakarta halte) |
| `hospital` | `amenity=hospital` |
| `public_facility` | `amenity=library`, `amenity=townhall`, `amenity=community_centre`, `amenity=police`, `leisure=park` |
| `other` | Anything checked by hand that fits none of the above |

Fill the OSM columns as follows:

- `osm_type` and `osm_id` come from the element's `type` and `id`. Do not
  prefix the ID (`123456789`, not `node/123456789`).
- `latitude` and `longitude` are WGS84 decimal degrees (EPSG:4326). A `node`
  gives its own `lat`/`lon`. A `way` or `relation` (most campuses, hospitals,
  and parks) has no single point, so use the `center` that `out center`
  returns. The database stores one point per place.
- `osm_tags` holds the element's full tag object as JSON, for example
  `{"amenity":"hospital","operator:type":"government"}`. Keep it even when the
  useful tags are also copied into `address`, `operator`, `website`, or `phone`.
- `source_name` is `OpenStreetMap`, `source_url` is
  `https://www.openstreetmap.org/<osm_type>/<osm_id>`, and `observed_at` is the
  date you ran the query.
- `region_code` may be left blank for rows that have an OSM ID and coordinates.
  The ETL assigns the kecamatan or kelurahan by point-in-polygon against the
  boundary layers (section 16). Fill it by hand only for rows without
  coordinates you trust.
- OSM data is licensed under ODbL 1.0 and requires the attribution
  "© OpenStreetMap contributors". Record it in `geospatial_sources` for any OSM
  file in `map_data/`.
- Check each exported row before delivery: remove closed or duplicate places
  (the same stop mapped as a node and a platform way), and set `is_active` to
  `FALSE` for places tagged `disused:*` or `abandoned:*`.

## 13. Housing statistics

**Sheet:** `housing_statistics`  
**Database:** `public.housing_statistics`

This sheet contains prepared aggregates, not current individual listings.

### Columns

```text
region_code
housing_type
median_monthly_rent_idr
average_monthly_rent_idr
minimum_monthly_rent_idr
maximum_monthly_rent_idr
observation_count
housing_price_index
period_start
period_end
source_name
source_url
published_at
retrieved_at
evidence_type
confidence
limitations
is_sample
```

### Example row

| region_code | housing_type | median_monthly_rent_idr | average_monthly_rent_idr | minimum_monthly_rent_idr | maximum_monthly_rent_idr | observation_count | housing_price_index | period_end | source_name | evidence_type | is_sample |
|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|
| pancoran | kos | 1750000 | 1850000 | 1000000 | 3500000 | 240 | 121.5 | 2026-06-30 | Prepared housing dataset | derived | TRUE |

BPS does not publish rents per kecamatan. Include an aggregate only when its
source names the area, period, and number of observations, and check that its
licence allows reuse.

## 14. Cost of living

**Sheet:** `cost_of_living`  
**Database:** `public.cost_of_living`

### Columns

```text
region_code
food_monthly_idr
utilities_monthly_idr
transport_monthly_idr
connectivity_monthly_idr
household_expenditure_monthly_idr
consumer_price_index
inflation_rate
period_start
period_end
source_name
source_url
published_at
retrieved_at
evidence_type
sample_size
confidence
limitations
is_sample
```

### Example row

| region_code | food_monthly_idr | utilities_monthly_idr | transport_monthly_idr | connectivity_monthly_idr | household_expenditure_monthly_idr | consumer_price_index | inflation_rate | period_end | source_name | evidence_type | is_sample |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|
| jakarta-selatan | 2500000 | 750000 | 900000 | 400000 | 8200000 |  |  | 2025-12-31 | BPS Susenas | observed | TRUE |

- Susenas usually reports spending per capita. State in `limitations` whether
  each value is per capita or per household.
- BPS computes one consumer price index for DKI Jakarta. Record the index and
  inflation on the `dki-jakarta` row.

## 15. Sector mapping

**Sheet:** `sector_mapping`  
**Database:** `public.sector_mapping` (reference for the backend and scoring)

BPS reports employment by KBLI 2020 section. Jejak's sectors are narrower, so a
KBLI section is always broader than the Jejak sector it contains.

### Columns

```text
kbli_2020_code
kbli_2020_name
jejak_sector_id
relationship
notes
```

### Example rows

| kbli_2020_code | kbli_2020_name | jejak_sector_id | relationship | notes |
|---|---|---|---|---|
| j | Informasi dan Komunikasi | software_and_it_services | contains | Section J also covers publishing and broadcasting |
| j | Informasi dan Komunikasi | telecommunications | contains | |
| k | Aktivitas Keuangan dan Asuransi | financial_technology | contains | Fintech is a small share of section K |

Jejak sector IDs: `software_and_it_services`, `telecommunications`,
`financial_technology`, `data_and_analytics`, `digital_commerce`,
`cybersecurity`, `technology_consulting`. Every one of them needs at least one
mapping row. `relationship` is `contains` (the KBLI section includes the Jejak
sector and other activities) or `equals`.

## 16. Map data

**Sheet:** `geospatial_sources`  
**Files:** a `map_data/` folder next to the workbook  
**Database:** `public.geospatial_sources`; map files are processed by the ETL
into `regions.geometry`, grid-cell `regions`, `region_data`, and `places`

Heatmaps need finer detail than a kecamatan. The ETL divides each supported city
into H3 hexagon cells (resolution 9, about 0.1 km² each), stores them as
`regions` with `region_type = grid`, and computes per-cell values such as
non-residential building volume, estimated office workers, residential
population, and transit access. **Do not compute cell values.** Deliver the
source files and describe each one in this sheet.

### Columns

```text
dataset_code
layer
dataset_name
provider
release
reference_period
spatial_resolution
crs
file_format
file_name
coverage
license
source_url
retrieved_at
limitations
```

### Layers needed

| `layer` | Contents | Suggested source |
|---|---|---|
| `boundary_district` | Kecamatan polygons with Kemendagri codes | BIG `BATASWILAYAH/BATAS_KECAMATAN_AR` |
| `boundary_neighborhood` | Kelurahan polygons with Kemendagri codes | BIG `BATASWILAYAH/BATAS_DESAKEL_AR` |
| `built_volume_nonresidential` | Non-residential building volume per 100 m cell | JRC GHSL GHS-BUILT-V (NRES) |
| `population_grid` | Residential population per 100 m cell | WorldPop or JRC GHSL GHS-POP |
| `building_heights` | Building presence and height grid | Google Open Buildings 2.5D Temporal |
| `buildings` | Footprints with floor counts, height, name, and use tags | OpenStreetMap extract |
| `transit` | MRT, LRT, KRL, and TransJakarta stations and stops | OpenStreetMap; TransJakarta GTFS if published |
| `flood_exposure` (optional) | Flood-prone areas | BPBD DKI Jakarta, if published |

### Example row

| dataset_code | layer | dataset_name | provider | release | reference_period | spatial_resolution | crs | file_format | file_name | coverage | license | source_url | retrieved_at | limitations |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ghsl_built_v_nres_2020 | built_volume_nonresidential | GHS-BUILT-V, non-residential | European Commission JRC | R2023A | 2020 | 100 m | EPSG:54009 | GeoTIFF | ghsl_built_v_nres_2020_jakarta.tif | DKI Jakarta crop | CC BY 4.0 | https://human-settlement.emergency.copernicus.eu/ghs_buV2023.php | 2026-09-26 | Building height assessed for 2018 and held constant across epochs |

- Crop files to the supported provinces; do not otherwise edit, resample, or
  reproject them. Record the CRS as published; the ETL reprojects.
- Record the licence and required attribution. The map shows only data whose
  licence allows it.
- Building footprints, heights, and built-up grids describe buildings, not
  companies, so they are static data and belong here. Tenant or company names
  inside buildings do not.

## 17. Estimation parameters

**Sheet:** `estimation_parameters`  
**Database:** `public.estimation_parameters` (stored with the ETL method version)

The office-worker estimate multiplies office floor area by published ratios.
Find published values, and give a low and a high value rather than one number.

### Columns

```text
parameter
value_low
value_high
unit
applies_to
region_code
period_end
source_name
source_url
published_at
limitations
is_sample
```

Parameters needed:

| `parameter` | Meaning |
|---|---|
| `office_floor_area_per_worker` | Office floor area per worker, in m² |
| `office_occupancy_rate` | Share of office space that is leased or occupied |
| `net_to_gross_floor_ratio` | Usable share of a building's gross floor area |
| `floor_height` | Average storey height in metres, to convert building height to floors |

### Example row

| parameter | value_low | value_high | unit | applies_to | region_code | period_end | source_name | source_url | published_at | limitations | is_sample |
|---|---:|---:|---|---|---|---|---|---|---|---|---|
| office_occupancy_rate | 0.70 | 0.76 | ratio | Jakarta CBD grade A offices | dki-jakarta | 2026-06-30 | Property market report | https://example.com/jakarta-office-q2 | 2026-07-15 | CBD only; secondary areas differ | TRUE |

Property consultancies publish office occupancy each quarter. Check that the
licence allows citing the figure.

## Preferred sources

Prioritize sources in this order:

1. BPS and BPS regional publications
2. Satu Data Indonesia and Satu Data Jakarta
3. Kemendagri and BIG
4. PDDikti and Kemendikbud
5. Ministry of Health
6. Ministry of Transportation and local transport agencies
7. Bank Indonesia
8. Official university annual reports
9. OpenStreetMap for public places, buildings, and transit
10. Open global grids: JRC GHSL, WorldPop, Google Open Buildings
11. Property market reports, only for `estimation_parameters`

For every dataset, record the exact dataset name, release date, URL, table or
page, geographic level, definitions, and limitations.

## Do not include in this workbook

```text
current job vacancies
current kos listings
current apartment listings
current house listings
company office presence
company-level local employment evidence
```

These belong to the dynamic flow:

```text
API checks the exact database cache scope
→ zone evidence discovery runs only when required evidence is missing or stale
→ backend validates candidates
→ zone_evidence_cache
→ privacy-safe regional snapshot
```

Buildings are not company evidence: footprints, heights, and built-up grids are
wanted in `map_data/`.

## Recommended workbook order

```text
01_regions
02_population
03_labor_force
04_sector_employment
05_wages_income
06_institutions
07_campuses
08_student_enrollment
09_education_facilities
10_healthcare_facilities
11_transport_infrastructure
12_public_places
13_housing_statistics
14_cost_of_living
15_sector_mapping
16_geospatial_sources
17_estimation_parameters
```

Put the files listed in `16_geospatial_sources` in `map_data/`.

## Handoff checklist

- Every row has a valid `region_code` or `institution_code`. The exception is
  OSM place rows with coordinates, where the ETL assigns the region (section 12).
- Parent regions exist in `regions`.
- Every province, city, district, and neighborhood row has its `kemendagri_code`.
- Each figure is recorded at the level its source reports; no city or province
  figure is copied into kecamatan or kelurahan rows.
- Institution codes match `institutions`.
- Campus OSM IDs match campus place rows.
- Sector rows use KBLI 2020 codes, and every Jejak sector appears in
  `sector_mapping`.
- Rates are decimals, not percentages from `0` to `100`.
- Money values are numeric IDR values, marked per capita or per household where
  it matters.
- Academic years and reporting periods are explicit.
- Source URLs and retrieval dates are present.
- Definitions and limitations are documented.
- Every file in `map_data/` has a `geospatial_sources` row with its CRS,
  resolution, and licence.
- No live listings or company-level evidence are included.
- Test rows are marked `is_sample = TRUE`.
- Real validated rows are marked `is_sample = FALSE` only after review.
