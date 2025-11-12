/**
 * JSON 데이터를 PostgreSQL로 마이그레이션하는 스크립트
 * 기존 JSON 파일의 데이터를 읽어 PostgreSQL 데이터베이스에 저장
 *
 * @author DOCORE
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// PostgreSQL 연결 설정
const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'pickup_db',
  user: 'pickup_user',
  password: 'pickup_password',
});

// JSON 파일 경로
const DATA_PATH = path.join(__dirname, '../assets/data/data.json');
const ACTIVITY_LOGS_PATH = path.join(__dirname, '../assets/data/activity_logs.json');
const RELEASE_NOTES_PATH = path.join(__dirname, '../assets/data/release_notes.json');

async function connect() {
  try {
    await client.connect();
    console.log('✅ PostgreSQL 연결 성공');
    await ensureSchema();
  } catch (error) {
    console.error('❌ PostgreSQL 연결 실패:', error);
    process.exit(1);
  }
}

// 스키마 보강 (신규 컬럼 추가)
async function ensureSchema() {
  await client.query(`
    ALTER TABLE store_settings
    ADD COLUMN IF NOT EXISTS seo_settings JSONB DEFAULT '{}'::jsonb
  `);
  await client.query(`
    ALTER TABLE store_settings
    ADD COLUMN IF NOT EXISTS ab_test_settings JSONB DEFAULT '{}'::jsonb
  `);
}

function hashPassword(password) {
  if (!password) return null;
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function migrateSuperAdmin(data) {
  const envUsername = process.env.SUPERADMIN_USERNAME ? process.env.SUPERADMIN_USERNAME.trim() : '';
  const envPassword = process.env.SUPERADMIN_PASSWORD ? process.env.SUPERADMIN_PASSWORD.trim() : '';

  const jsonSuperadmin = data.superadmin || {};
  const sourceUsername = envUsername || jsonSuperadmin.username || '';
  const sourcePassword = envPassword || jsonSuperadmin.password || '';
  const createdAt = jsonSuperadmin.createdAt ? new Date(jsonSuperadmin.createdAt) : new Date();
  const lastModified = jsonSuperadmin.lastModified ? new Date(jsonSuperadmin.lastModified) : new Date();

  if (!sourceUsername || !sourcePassword) {
    console.log('📭 슈퍼어드민 시드 데이터가 없어 건너뜁니다.');
    return;
  }

  const existing = await client.query(`SELECT id FROM superadmin LIMIT 1`);
  if (existing.rows.length > 0) {
    console.log('ℹ️ 슈퍼어드민 레코드가 이미 존재하여 시드 데이터를 건너뜁니다.');
    return;
  }

  console.log('👤 슈퍼어드민 데이터 마이그레이션...');

  const passwordHash = /^[0-9a-f]{64}$/i.test(sourcePassword)
    ? sourcePassword
    : hashPassword(sourcePassword);

  await client.query(`
    INSERT INTO superadmin (username, password_hash, created_at, last_modified)
    VALUES ($1, $2, $3, $4)
  `, [sourceUsername, passwordHash, createdAt, lastModified]);
  
  console.log('✅ 슈퍼어드민 데이터 마이그레이션 완료');
}

async function migrateStores(stores) {
  if (!stores || !Array.isArray(stores)) return;
  
  console.log(`🏪 ${stores.length}개 가게 데이터 마이그레이션...`);
  
  for (const store of stores) {
    await client.query(`
      INSERT INTO stores (
        id, name, subtitle, phone, address, status, subdomain,
        subdomain_status, subdomain_created_at, subdomain_last_modified,
        "order", created_at, last_modified, paused_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        subtitle = EXCLUDED.subtitle,
        phone = EXCLUDED.phone,
        address = EXCLUDED.address,
        status = EXCLUDED.status,
        subdomain = EXCLUDED.subdomain,
        subdomain_status = EXCLUDED.subdomain_status,
        subdomain_created_at = EXCLUDED.subdomain_created_at,
        subdomain_last_modified = EXCLUDED.subdomain_last_modified,
        "order" = EXCLUDED."order",
        last_modified = EXCLUDED.last_modified,
        paused_at = EXCLUDED.paused_at
    `, [
      store.id,
      store.name,
      store.subtitle || null,
      store.phone || null,
      store.address || null,
      store.status || 'active',
      store.subdomain || null,
      store.subdomainStatus || null,
      store.subdomainCreatedAt ? new Date(store.subdomainCreatedAt) : null,
      store.subdomainLastModified ? new Date(store.subdomainLastModified) : null,
      store.order || 0,
      new Date(store.createdAt),
      new Date(store.lastModified),
      store.pausedAt ? new Date(store.pausedAt) : null
    ]);
  }
  
  console.log(`✅ ${stores.length}개 가게 데이터 마이그레이션 완료`);
}

async function migrateStoreSettings(settings) {
  if (!settings || Object.keys(settings).length === 0) return;
  
  const storeIds = Object.keys(settings);
  console.log(`⚙️ ${storeIds.length}개 가게 설정 데이터 마이그레이션...`);
  
  for (const storeId of storeIds) {
    const setting = settings[storeId];
    
    await client.query(`
      INSERT INTO store_settings (
        store_id, basic, discount, delivery, pickup, images,
        business_hours, section_order, qr_code, seo_settings, ab_test_settings,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (store_id) DO UPDATE SET
        basic = EXCLUDED.basic,
        discount = EXCLUDED.discount,
        delivery = EXCLUDED.delivery,
        pickup = EXCLUDED.pickup,
        images = EXCLUDED.images,
        business_hours = EXCLUDED.business_hours,
        section_order = EXCLUDED.section_order,
        qr_code = EXCLUDED.qr_code,
        seo_settings = EXCLUDED.seo_settings,
        ab_test_settings = EXCLUDED.ab_test_settings,
        updated_at = EXCLUDED.updated_at
    `, [
      storeId,
      JSON.stringify(setting.basic || {}),
      JSON.stringify(setting.discount || {}),
      JSON.stringify(setting.delivery || {}),
      JSON.stringify(setting.pickup || {}),
      JSON.stringify(setting.images || {}),
      JSON.stringify(setting.businessHours || {}),
      JSON.stringify(setting.sectionOrder || {}),
      JSON.stringify(setting.qrCode || {}),
      JSON.stringify(setting.seoSettings || {}),
      JSON.stringify(setting.abTestSettings || {}),
      new Date(),
      new Date()
    ]);
  }
  
  console.log(`✅ ${storeIds.length}개 가게 설정 데이터 마이그레이션 완료`);
}

async function migrateCurrentStore(currentStoreId) {
  if (!currentStoreId) return;
  
  console.log(`📌 현재 가게 ID 마이그레이션: ${currentStoreId}`);
  
  await client.query(`
    INSERT INTO current_store (id, store_id, created_at, updated_at)
    VALUES (1, $1, $2, $3)
    ON CONFLICT (id) DO UPDATE SET
      store_id = EXCLUDED.store_id,
      updated_at = EXCLUDED.updated_at
  `, [currentStoreId, new Date(), new Date()]);
  
  console.log('✅ 현재 가게 ID 마이그레이션 완료');
}

async function migrateActivityLogs(activityLogs) {
  try {
    if (!activityLogs || !Array.isArray(activityLogs) || activityLogs.length === 0) {
      console.log('📝 활동 로그 데이터 없음, 건너뜀');
      return;
    }
    
    const logs = activityLogs;
    
    console.log(`📝 ${logs.length}개 활동 로그 마이그레이션...`);
    
    for (const log of logs) {
      await client.query(`
        INSERT INTO activity_logs (
          id, type, action, description, user_id, user_name,
          target_type, target_id, target_name, details, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE SET
          type = EXCLUDED.type,
          action = EXCLUDED.action,
          description = EXCLUDED.description,
          user_id = EXCLUDED.user_id,
          user_name = EXCLUDED.user_name,
          target_type = EXCLUDED.target_type,
          target_id = EXCLUDED.target_id,
          target_name = EXCLUDED.target_name,
          details = EXCLUDED.details,
          timestamp = EXCLUDED.timestamp
      `, [
        log.id,
        log.type,
        log.action,
        log.description || null,
        log.userId || null,
        log.userName || null,
        log.targetType || null,
        log.targetId || null,
        log.targetName || null,
        JSON.stringify(log.details || {}),
        new Date(log.timestamp)
      ]);
    }
    
    console.log(`✅ ${logs.length}개 활동 로그 마이그레이션 완료`);
  } catch (error) {
    console.warn('⚠️ 활동 로그 마이그레이션 실패:', error.message);
  }
}

async function migrateReleaseNotes() {
  try {
    if (!fs.existsSync(RELEASE_NOTES_PATH)) {
      console.log('📋 릴리즈 노트 파일 없음, 건너뜀');
      return;
    }
    
    const notes = JSON.parse(fs.readFileSync(RELEASE_NOTES_PATH, 'utf-8'));
    
    if (!Array.isArray(notes) || notes.length === 0) {
      console.log('📋 릴리즈 노트 데이터 없음, 건너뜀');
      return;
    }
    
    console.log(`📋 ${notes.length}개 릴리즈 노트 마이그레이션...`);
    
    for (const note of notes) {
      await client.query(`
        INSERT INTO release_notes (
          version, codename, release_date, title, highlights,
          features, bug_fixes, technical_improvements, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (version) DO UPDATE SET
          codename = EXCLUDED.codename,
          release_date = EXCLUDED.release_date,
          title = EXCLUDED.title,
          highlights = EXCLUDED.highlights,
          features = EXCLUDED.features,
          bug_fixes = EXCLUDED.bug_fixes,
          technical_improvements = EXCLUDED.technical_improvements
      `, [
        note.version,
        note.codename || null,
        new Date(note.releaseDate),
        note.title,
        JSON.stringify(note.highlights || {}),
        JSON.stringify(note.features || {}),
        JSON.stringify(note.bugFixes || {}),
        JSON.stringify(note.technicalImprovements || {}),
        new Date(note.createdAt)
      ]);
    }
    
    console.log(`✅ ${notes.length}개 릴리즈 노트 마이그레이션 완료`);
  } catch (error) {
    console.warn('⚠️ 릴리즈 노트 마이그레이션 실패:', error.message);
  }
}

async function syncOwnerStoreLinks() {
  console.log('🔗 기존 점주-가게 매핑 동기화...');
  await client.query(`
    INSERT INTO store_owner_links (owner_id, store_id, role)
    SELECT id, store_id, 'manager'
      FROM store_owners
     WHERE store_id IS NOT NULL
    ON CONFLICT (owner_id, store_id) DO NOTHING
  `);
  console.log('✅ 점주-가게 매핑 동기화 완료');
}

async function main() {
  console.log('🚀 JSON to PostgreSQL 마이그레이션 시작...');
  
  try {
    // 1. PostgreSQL 연결
    await connect();
    
    // 2. JSON 데이터 읽기
    const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
    
    // 3. 데이터 마이그레이션
    await migrateSuperAdmin(data);
    await migrateStores(data.stores);
    await migrateStoreSettings(data.settings);
    await migrateCurrentStore(data.currentStoreId);
    await migrateActivityLogs(data.activityLogs);
    await migrateReleaseNotes(data.releaseNotes);
    await syncOwnerStoreLinks();
    
    console.log('🎉 마이그레이션 완료!');
    
    // 4. 데이터 검증
    const result = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM superadmin) as superadmin_count,
        (SELECT COUNT(*) FROM stores) as stores_count,
        (SELECT COUNT(*) FROM store_settings) as settings_count,
        (SELECT COUNT(*) FROM current_store) as current_store_count,
        (SELECT COUNT(*) FROM activity_logs) as activity_logs_count,
        (SELECT COUNT(*) FROM release_notes) as release_notes_count
    `);
    
    console.log('\n📊 마이그레이션 결과:');
    console.log(`- 슈퍼어드민: ${result.rows[0].superadmin_count}개`);
    console.log(`- 가게: ${result.rows[0].stores_count}개`);
    console.log(`- 가게 설정: ${result.rows[0].settings_count}개`);
    console.log(`- 현재 가게: ${result.rows[0].current_store_count}개`);
    console.log(`- 활동 로그: ${result.rows[0].activity_logs_count}개`);
    console.log(`- 릴리즈 노트: ${result.rows[0].release_notes_count}개`);
    
  } catch (error) {
    console.error('❌ 마이그레이션 실패:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
