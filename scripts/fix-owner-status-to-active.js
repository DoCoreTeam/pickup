/**
 * 점주 계정 status를 'active'로 수정하는 스크립트
 * 
 * 실행 방법:
 * node scripts/fix-owner-status-to-active.js
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

async function fixOwnerStatusToActive() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 점주 계정 status를 active로 수정 시작...\n');

    await client.query('BEGIN');

    // 1. 현재 상태 확인
    const currentStatus = await client.query(`
      SELECT 
        status,
        COUNT(*) as count
      FROM store_owners
      GROUP BY status
      ORDER BY count DESC
    `);
    
    console.log('1️⃣ 현재 status 값 분포:');
    currentStatus.rows.forEach(row => {
      console.log(`   - "${row.status}": ${row.count}개`);
    });
    console.log('');

    // 2. 가게에 연결된 점주 중 status가 'active'가 아닌 계정 찾기
    const linkedNonActive = await client.query(`
      SELECT DISTINCT
        o.id,
        o.email,
        o.status,
        o.owner_name,
        COUNT(sol.store_id) as linked_store_count
      FROM store_owners o
      JOIN store_owner_links sol ON sol.owner_id = o.id
      WHERE o.status != 'active' OR o.status IS NULL
      GROUP BY o.id, o.email, o.status, o.owner_name
      ORDER BY o.status, o.email
    `);
    
    console.log(`2️⃣ 가게에 연결된 점주 중 status != 'active': ${linkedNonActive.rows.length}명`);
    if (linkedNonActive.rows.length > 0) {
      linkedNonActive.rows.forEach(row => {
        console.log(`   - ${row.email} (${row.owner_name || '이름 없음'}): status="${row.status || 'null'}", 연결된 가게 ${row.linked_store_count}개`);
      });
      console.log('');
    }

    // 3. 'active'와 유사한 값들을 가진 계정 찾기
    const similarToActive = await client.query(`
      SELECT 
        id,
        email,
        status,
        owner_name
      FROM store_owners
      WHERE (LOWER(TRIM(status)) LIKE '%active%' 
         OR LOWER(TRIM(status)) LIKE '%approv%'
         OR LOWER(TRIM(status)) LIKE '%run%')
         AND status != 'active'
      ORDER BY email
    `);
    
    console.log(`3️⃣ "active"와 유사한 status 값을 가진 계정: ${similarToActive.rows.length}개`);
    if (similarToActive.rows.length > 0) {
      similarToActive.rows.forEach(row => {
        console.log(`   - ${row.email}: status="${row.status}"`);
      });
      console.log('');
    }

    // 4. 수정 대상 결정: 가게에 연결된 점주 중 active가 아닌 계정
    const toFix = linkedNonActive.rows;
    
    if (toFix.length === 0) {
      console.log('✅ 수정할 계정이 없습니다. 모든 연결된 점주가 이미 status="active"입니다.\n');
      await client.query('ROLLBACK');
      return;
    }

    console.log(`4️⃣ 수정 대상: ${toFix.length}개 계정을 status='active'로 변경합니다.\n`);
    
    // 5. 실제 수정 실행
    for (const owner of toFix) {
      const result = await client.query(
        `UPDATE store_owners
         SET status = 'active'
         WHERE id = $1
         RETURNING id, email, status`,
        [owner.id]
      );
      
      if (result.rows.length > 0) {
        console.log(`   ✅ ${owner.email}: "${owner.status || 'null'}" → "active"`);
      } else {
        console.log(`   ⚠️  ${owner.email}: 수정 실패 (계정을 찾을 수 없음)`);
      }
    }

    await client.query('COMMIT');
    console.log('\n✅ 수정 완료');

    // 6. 수정 후 확인
    const afterStatus = await client.query(`
      SELECT 
        status,
        COUNT(*) as count
      FROM store_owners
      GROUP BY status
      ORDER BY count DESC
    `);
    
    console.log('\n5️⃣ 수정 후 status 값 분포:');
    afterStatus.rows.forEach(row => {
      console.log(`   - "${row.status}": ${row.count}개`);
    });

    const activeCount = afterStatus.rows.find(r => r.status === 'active')?.count || 0;
    console.log(`\n📊 최종 결과: status='active'인 계정 ${activeCount}개`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ 수정 실패:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  console.log('⚠️  이 스크립트는 가게에 연결된 점주 계정의 status를 "active"로 변경합니다.');
  console.log('계속하시겠습니까? (y/N)');
  
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  rl.question('', (answer) => {
    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
      fixOwnerStatusToActive()
        .then(() => {
          console.log('\n✅ 수정 완료');
          process.exit(0);
        })
        .catch(error => {
          console.error('\n❌ 수정 실패:', error);
          process.exit(1);
        });
    } else {
      console.log('취소되었습니다.');
      process.exit(0);
    }
    rl.close();
  });
}

module.exports = { fixOwnerStatusToActive };

