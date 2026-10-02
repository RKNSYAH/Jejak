import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyMigrations, asRole, createDatabase } from './bootstrap.mjs';

test('static research migration preserves identities, unknowns and public read boundaries', async (t) => {
  const db = await createDatabase();
  t.after(() => db.close());
  await applyMigrations(db);
  const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  await db.exec(`insert into public.regions(region_code,region_name,region_type,parent_region_code,is_supported)
    values ('research-city','City','city',null,true),
      ('research-district','District','district','research-city',true),
      ('research-neighborhood','Kelurahan','neighborhood','research-district',true),
      ('research-sibling','Sibling','district','research-city',true);`);
  const district = await one("select id from public.regions where region_code='research-district'");
  const neighborhood = await one("select id from public.regions where region_code='research-neighborhood'");
  await asRole(db, 'service_role', async () => {
    await db.exec(`insert into public.regions(region_code,region_name,region_type,parent_region_code,is_supported)
      values ('research-unclassified','Unclassified source feature','unclassified_area','research-city',false)`);
    await assert.rejects(db.exec(`update public.regions set is_supported=true
      where region_code='research-unclassified'`), /regions_unclassified_safety_ck/);
    await assert.rejects(db.exec(`update public.regions set kemendagri_code='31.74.99'
      where region_code='research-unclassified'`), /regions_unclassified_safety_ck/);
    await db.exec(`insert into public.institutions(institution_code,institution_name,institution_type,is_active)
      values ('research-uni','University','university',null)`);
    await db.exec(`insert into public.public_places(region_code,place_name,category,osm_type,osm_id,latitude,longitude,source_name)
      values ('research-neighborhood',null,'transit_stop','node',100,-6.2,106.8,'OpenStreetMap'),
        ('research-city','City only','station','node',101,-6.2,106.8,'OpenStreetMap'),
        ('research-sibling','Sibling only','station','node',102,-6.2,106.8,'OpenStreetMap')`);
    await db.exec(`insert into public.student_enrollment(institution_code,metric,student_count,data_scope,program_name,source_name,evidence_type)
      values ('research-uni','program_enrollment',10,'program','Computing - S1','Table','observed'),
        ('research-uni','program_enrollment',20,'program','Computing - S2','Table','observed')`);
    assert.equal((await one("select count(*)::int as n from public.student_enrollment where institution_code='research-uni'")).n, 2);
    await db.exec(`insert into public.student_enrollment(institution_code,metric,student_count,data_scope,program_name,source_name,evidence_type)
      values ('research-uni','program_enrollment',11,'program','Computing - S1','Table','observed')
      on conflict (institution_code,campus_osm_type,campus_osm_id,metric,data_scope,program_identity,academic_year,period_start,period_end,source_name)
      do update set student_count=excluded.student_count`);
    assert.equal((await one("select count(*)::int as n from public.student_enrollment where institution_code='research-uni'")).n, 2);
    await db.exec(`insert into public.campuses(institution_code,region_code,campus_name,latitude,longitude,source_name)
      values ('research-uni','research-district','Official campus',-6.2,106.8,'Official')
      on conflict (institution_code,campus_name) where osm_type is null and osm_id is null
      do update set latitude=excluded.latitude`);
    await db.exec(`insert into public.campuses(institution_code,region_code,campus_name,latitude,longitude,source_name)
      values ('research-uni','research-district','Official campus',-6.21,106.8,'Official')
      on conflict (institution_code,campus_name) where osm_type is null and osm_id is null
      do update set latitude=excluded.latitude`);
    assert.equal((await one("select count(*)::int as n from public.campuses where institution_code='research-uni'")).n, 1);
    await db.exec(`insert into public.sector_employment(region_code,kbli_2020_code,kbli_2020_name,employment_percentage,source_name,evidence_type)
      values ('research-city','g_h_i_j_k_l_m_n_o_p_q_r_s_t_u','Services',0.7,'Official','estimated')`);
    assert.ok((await db.query("select * from public.get_region_data((select id from public.regions where region_code='research-city'))")).rows
      .some((r) => r.metric === 'employment_percentage:kbli_g_h_i_j_k_l_m_n_o_p_q_r_s_t_u'));
    await assert.rejects(db.exec(`insert into public.living_cost_rates(region_code,spending_tier,food_monthly_idr,
      utilities_monthly_idr,transport_monthly_idr,connectivity_monthly_idr,laundry_monthly_idr,living_cost_total_monthly_idr,
      persons,source_name,source_url,retrieved_at,evidence_type,assumptions,limitations,is_sample,as_of,method_version)
      values ('research-city','budget',1,2,3,4,5,99,1,'Scenario','https://example.test','2026-10-01',
        'estimated','Analyst inputs','One person',false,'2026-10-01','v1')`), /living_cost_rates_total_ck/);
    await assert.rejects(db.exec(`update public.institutions set source_urls='["http://example.test"]'
      where institution_code='research-uni'`), /source_urls_ck/);
  });
  assert.equal((await one("select is_active from public.institutions where institution_code='research-uni'")).is_active, null);
  assert.equal((await one('select place_name from public.public_places where osm_id=100')).place_name, null);
  await asRole(db, 'anon', async () => {
    const places = (await db.query('select * from public.get_public_places($1)', [district.id])).rows;
    assert.equal(places.length, 2); // One campus and one child stop, not city/sibling points.
    const stop = places.find((p) => p.osm_id === 100);
    assert.equal(stop.name, 'Halte tanpa nama');
    assert.equal(stop.region_id, neighborhood.id);
    const map = await one("select * from public.get_map_region('research-district',false,false)");
    assert.equal(map.places.length, 2);
    assert.equal((await db.query("select * from public.get_map_region('research-unclassified',false,false)")).rows.length, 0);
    for (const table of ['public.living_cost_rates', 'public.monthly_budgets', 'private.static_import_rows', 'private.static_import_batches']) {
      await assert.rejects(db.query(`select * from ${table}`), /permission denied/);
    }
    await assert.rejects(db.query('select * from private.static_place_rows($1)', [district.id]), /permission denied/);
  });
  await asRole(db, 'authenticated', async () => {
    await assert.rejects(db.query('insert into public.monthly_budgets default values'), /permission denied/);
  });
});
