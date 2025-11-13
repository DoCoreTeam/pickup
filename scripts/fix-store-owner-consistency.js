/**
 * Store-Owner 데이터 정합성 보정 스크립트
 * 
 * 주의: 이 스크립트는 데이터를 수정합니다. 실행 전 백업을 권장합니다.
 * 
 * 실행 방법:
 * node scripts/fix-store-owner-consistency.js
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

async function fixStoreOwnerConsistency() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Store-Owner 데이터 정합성 보정 시작...\n');

    await client.query('BEGIN');

    // 1. 존재하지 않는 Owner를 가리키는 store_owner_links 삭제
    const deleteOrphanedLinks = await client.query(`
      DELETE FROM store_owner_links sol
      WHERE NOT EXISTS (
        SELECT 1 FROM store_owners o WHERE o.id = sol.owner_id
      )
      RETURNING sol.owner_id, sol.store_id
    `);
    
    if (deleteOrphanedLinks.rows.length > 0) {
      console.log(`1️⃣ 존재하지 않는 Owner를 가리키는 links 삭제: ${deleteOrphanedLinks.rows.length}건`);
      deleteOrphanedLinks.rows.forEach(row => {
        console.log(`   - owner_id: ${row.owner_id}, store_id: ${row.store_id}`);
      });
    } else {
      console.log('1️⃣ 존재하지 않는 Owner를 가리키는 links: 없음');
    }

    // 2. pending/rejected 상태인 Owner의 연결 제거 (선택사항)
    // 주의: 이 부분은 주석 처리되어 있습니다. 필요시 주석을 해제하세요.
    /*
    const deleteInactiveLinks = await client.query(`
      DELETE FROM store_owner_links sol
      WHERE EXISTS (
        SELECT 1 FROM store_owners o 
        WHERE o.id = sol.owner_id 
        AND o.status IN ('pending', 'rejected')
      )
      RETURNING sol.owner_id, sol.store_id
    `);
    
    if (deleteInactiveLinks.rows.length > 0) {
      console.log(`2️⃣ pending/rejected 상태 점주의 연결 제거: ${deleteInactiveLinks.rows.length}건`);
    } else {
      console.log('2️⃣ pending/rejected 상태 점주의 연결: 없음');
    }
    */

    await client.query('COMMIT');
    console.log('\n✅ 보정 완료');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ 보정 실패:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  console.log('⚠️  이 스크립트는 데이터를 수정합니다.');
  console.log('계속하시겠습니까? (y/N)');
  
  // 간단한 확인 (실제로는 readline을 사용하는 것이 좋습니다)
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  rl.question('', (answer) => {
    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
      fixStoreOwnerConsistency()
        .then(() => {
          console.log('\n✅ 보정 완료');
          process.exit(0);
        })
        .catch(error => {
          console.error('\n❌ 보정 실패:', error);
          process.exit(1);
        });
    } else {
      console.log('취소되었습니다.');
      process.exit(0);
    }
    rl.close();
  });
}

module.exports = { fixStoreOwnerConsistency };

