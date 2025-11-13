/**
 * 점주 계정의 실제 status 값 확인 스크립트
 * 
 * 실행 방법:
 * node scripts/check-owner-status-values.js
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

async function checkOwnerStatusValues() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 점주 계정의 실제 status 값 확인...\n');

    // 1. 모든 status 값과 개수 확인
    const statusCounts = await client.query(`
      SELECT 
        status,
        COUNT(*) as count,
        STRING_AGG(email, ', ' ORDER BY email) as emails
      FROM store_owners
      GROUP BY status
      ORDER BY count DESC
    `);
    
    console.log('1️⃣ 점주 계정 status 값별 개수:');
    if (statusCounts.rows.length === 0) {
      console.log('   ⚠️  점주 계정이 없습니다.\n');
    } else {
      statusCounts.rows.forEach(row => {
        const status = row.status || '(null)';
        const count = row.count;
        const emails = row.emails ? row.emails.split(', ').slice(0, 5).join(', ') : '';
        const moreEmails = row.emails && row.emails.split(', ').length > 5 ? ` 외 ${row.emails.split(', ').length - 5}개` : '';
        console.log(`   - status: "${status}" (${count}개)`);
        if (emails) {
          console.log(`     이메일: ${emails}${moreEmails}`);
        }
      });
      console.log('');
    }

    // 2. 'active'와 유사한 값 확인 (대소문자, 공백 등)
    const similarToActive = await client.query(`
      SELECT 
        id,
        email,
        status,
        LENGTH(status) as status_length,
        status = 'active' as exact_match,
        LOWER(TRIM(status)) = 'active' as case_insensitive_match
      FROM store_owners
      WHERE LOWER(TRIM(status)) LIKE '%active%' 
         OR LOWER(TRIM(status)) LIKE '%approv%'
         OR LOWER(TRIM(status)) LIKE '%run%'
      ORDER BY status, email
    `);
    
    console.log('2️⃣ "active"와 유사한 status 값을 가진 계정:');
    if (similarToActive.rows.length === 0) {
      console.log('   ✅ "active"와 유사한 값이 없습니다.\n');
    } else {
      similarToActive.rows.forEach(row => {
        console.log(`   - ID: ${row.id}, Email: ${row.email}`);
        console.log(`     status: "${row.status}" (길이: ${row.status_length})`);
        console.log(`     exact_match: ${row.exact_match}, case_insensitive_match: ${row.case_insensitive_match}`);
        console.log('');
      });
    }

    // 3. 'active'로 조회했을 때 나오는 계정 확인
    const activeQuery = await client.query(`
      SELECT 
        id,
        email,
        status,
        owner_name,
        created_at
      FROM store_owners
      WHERE status = $1
      ORDER BY created_at DESC
    `, ['active']);
    
    console.log(`3️⃣ status = 'active' 조건으로 조회한 결과: ${activeQuery.rows.length}개`);
    if (activeQuery.rows.length === 0) {
      console.log('   ⚠️  status = "active"인 계정이 없습니다.\n');
    } else {
      activeQuery.rows.forEach(row => {
        console.log(`   - ${row.email} (${row.owner_name || '이름 없음'})`);
      });
      console.log('');
    }

    // 4. 가게에 연결된 점주 중 status 확인
    const linkedOwners = await client.query(`
      SELECT DISTINCT
        o.id,
        o.email,
        o.status,
        COUNT(sol.store_id) as linked_store_count
      FROM store_owners o
      JOIN store_owner_links sol ON sol.owner_id = o.id
      GROUP BY o.id, o.email, o.status
      ORDER BY o.status, o.email
    `);
    
    console.log('4️⃣ 가게에 연결된 점주들의 status:');
    if (linkedOwners.rows.length === 0) {
      console.log('   ⚠️  연결된 점주가 없습니다.\n');
    } else {
      linkedOwners.rows.forEach(row => {
        console.log(`   - ${row.email}: status="${row.status}", 연결된 가게 ${row.linked_store_count}개`);
      });
      console.log('');
    }

    // 5. 요약 및 권장사항
    console.log('📊 요약:');
    const activeCount = statusCounts.rows.find(r => r.status === 'active')?.count || 0;
    const rejectedCount = statusCounts.rows.find(r => r.status === 'rejected')?.count || 0;
    
    console.log(`   - status = 'active': ${activeCount}개`);
    console.log(`   - status = 'rejected': ${rejectedCount}개`);
    
    if (activeCount === 0 && linkedOwners.rows.length > 0) {
      const linkedStatuses = [...new Set(linkedOwners.rows.map(r => r.status))];
      console.log(`\n⚠️  주의: 가게에 연결된 점주가 있지만, 그들의 status는: ${linkedStatuses.join(', ')}`);
      console.log('   → "운영 중" 탭에 표시되려면 status = "active"여야 합니다.');
      console.log('   → 현재 연결된 점주의 status를 "active"로 변경해야 할 수 있습니다.');
    }
    
    if (similarToActive.rows.length > 0) {
      const similarStatuses = [...new Set(similarToActive.rows.map(r => r.status))];
      console.log(`\n⚠️  주의: "active"와 유사한 status 값 발견: ${similarStatuses.join(', ')}`);
      console.log('   → 이 값들을 "active"로 변경해야 "운영 중" 탭에 표시됩니다.');
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
  checkOwnerStatusValues()
    .then(() => {
      console.log('\n✅ 확인 완료');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ 확인 실패:', error);
      process.exit(1);
    });
}

module.exports = { checkOwnerStatusValues };

