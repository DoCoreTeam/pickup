/**
 * Store-Owner 데이터 정합성 점검 스크립트
 * 
 * 실행 방법:
 * node scripts/check-store-owner-consistency.js
 */

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../env.database') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'pickup',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

async function checkStoreOwnerConsistency() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Store-Owner 데이터 정합성 점검 시작...\n');

    // 1. store_owner_links에 존재하지만 store_owners에 없는 owner_id 확인
    const orphanedLinks = await client.query(`
      SELECT DISTINCT sol.owner_id, sol.store_id
      FROM store_owner_links sol
      LEFT JOIN store_owners o ON sol.owner_id = o.id
      WHERE o.id IS NULL
    `);
    
    console.log('1️⃣ 존재하지 않는 Owner를 가리키는 store_owner_links:');
    if (orphanedLinks.rows.length === 0) {
      console.log('   ✅ 문제 없음 (0건)\n');
    } else {
      console.log(`   ⚠️  ${orphanedLinks.rows.length}건 발견`);
      orphanedLinks.rows.forEach(row => {
        console.log(`      - owner_id: ${row.owner_id}, store_id: ${row.store_id}`);
      });
      console.log('');
    }

    // 2. store_owners.status = 'active' 인 계정 수
    const activeOwners = await client.query(`
      SELECT COUNT(*) as count
      FROM store_owners
      WHERE status = 'active'
    `);
    console.log(`2️⃣ status = 'active' 인 점주 계정: ${activeOwners.rows[0].count}개\n`);

    // 3. 'active' 인 Owner가 연결된 가게 수
    const activeOwnerStores = await client.query(`
      SELECT 
        o.id,
        o.owner_name,
        o.email,
        COUNT(sol.store_id) as store_count
      FROM store_owners o
      LEFT JOIN store_owner_links sol ON sol.owner_id = o.id
      WHERE o.status = 'active'
      GROUP BY o.id, o.owner_name, o.email
      ORDER BY store_count DESC
    `);
    console.log('3️⃣ active 상태 점주별 연결된 가게 수:');
    if (activeOwnerStores.rows.length === 0) {
      console.log('   ⚠️  active 상태 점주가 없습니다.\n');
    } else {
      activeOwnerStores.rows.forEach(row => {
        console.log(`   - ${row.owner_name || row.email}: ${row.store_count}개 가게`);
      });
      console.log('');
    }

    // 4. store_owner_links에 연결되어 있지만 store_owners.status가 'active'가 아닌 경우
    const inactiveLinkedOwners = await client.query(`
      SELECT DISTINCT
        o.id,
        o.owner_name,
        o.email,
        o.status,
        COUNT(sol.store_id) as store_count
      FROM store_owner_links sol
      JOIN store_owners o ON sol.owner_id = o.id
      WHERE o.status != 'active'
      GROUP BY o.id, o.owner_name, o.email, o.status
      ORDER BY o.status, o.owner_name
    `);
    console.log('4️⃣ active가 아닌 상태의 점주가 연결된 가게:');
    if (inactiveLinkedOwners.rows.length === 0) {
      console.log('   ✅ 문제 없음 (모든 연결된 점주가 active 상태)\n');
    } else {
      console.log(`   ⚠️  ${inactiveLinkedOwners.rows.length}명 발견`);
      inactiveLinkedOwners.rows.forEach(row => {
        console.log(`      - ${row.owner_name || row.email} (${row.status}): ${row.store_count}개 가게`);
      });
      console.log('');
    }

    // 5. stores 테이블의 owner_id 필드가 있는지 확인 (legacy 필드)
    const storesWithOwnerId = await client.query(`
      SELECT COUNT(*) as count
      FROM information_schema.columns
      WHERE table_name = 'stores' AND column_name = 'owner_id'
    `);
    
    if (storesWithOwnerId.rows[0].count > 0) {
      const legacyOwnerIdStores = await client.query(`
        SELECT COUNT(*) as count
        FROM stores
        WHERE owner_id IS NOT NULL AND owner_id != ''
      `);
      console.log(`5️⃣ stores.owner_id 필드 사용 현황: ${legacyOwnerIdStores.rows[0].count}개 가게`);
      console.log('   ⚠️  참고: stores.owner_id는 legacy 필드입니다. store_owner_links를 사용해야 합니다.\n');
    } else {
      console.log('5️⃣ stores.owner_id 필드: 없음 (정상)\n');
    }

    // 요약
    console.log('📊 요약:');
    console.log(`   - active 점주 계정: ${activeOwners.rows[0].count}개`);
    console.log(`   - orphaned links: ${orphanedLinks.rows.length}건`);
    console.log(`   - inactive 연결된 점주: ${inactiveLinkedOwners.rows.length}명`);
    
    if (orphanedLinks.rows.length > 0 || inactiveLinkedOwners.rows.length > 0) {
      console.log('\n⚠️  데이터 정합성 문제가 발견되었습니다.');
      console.log('   아래 보정 스크립트를 실행하여 정리할 수 있습니다:');
      console.log('   node scripts/fix-store-owner-consistency.js');
    } else {
      console.log('\n✅ 데이터 정합성 문제 없음');
    }

  } catch (error) {
    console.error('❌ 오류 발생:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  checkStoreOwnerConsistency()
    .then(() => {
      console.log('\n✅ 점검 완료');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ 점검 실패:', error);
      process.exit(1);
    });
}

module.exports = { checkStoreOwnerConsistency };

