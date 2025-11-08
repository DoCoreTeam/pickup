/**
 * 데이터베이스 서비스 모듈
 * 기존 API 서버에서 사용할 데이터베이스 서비스
 *
 * @author DOCORE
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../env.database') });

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { getClient } = require('./connection');
const db = getClient();

function hashPassword(password) {
  const trimmed = (password || '').trim();
  if (!trimmed) {
    return null;
  }
  return crypto.createHash('sha256').update(trimmed).digest('hex');
}

// 슈퍼어드민 조회
async function getSuperAdmin() {
  const result = await db.query(`
    SELECT id, username, password_hash, created_at, last_modified
    FROM superadmin
    ORDER BY last_modified DESC NULLS LAST, id ASC
    LIMIT 1
  `);

  if (result.rows.length === 0) {
    return null;
  }

  const admin = result.rows[0];
  return {
    username: admin.username,
    hasPassword: Boolean(admin.password_hash),
    createdAt: admin.created_at ? admin.created_at.toISOString() : null,
    lastModified: admin.last_modified ? admin.last_modified.toISOString() : null
  };
}

// 슈퍼어드민 계정 정보 업데이트
async function updateSuperAdminAccount({ username, password = null }) {
  const trimmedUsername = (username || '').trim();
  if (!trimmedUsername) {
    throw new Error('계정명을 입력해주세요.');
  }

  const existing = await db.query(`SELECT id, password_hash FROM superadmin ORDER BY id ASC LIMIT 1`);
  const isNew = existing.rows.length === 0;
  const trimmedPassword = password && password.trim() ? password.trim() : null;
  const hashedPassword = trimmedPassword ? hashPassword(trimmedPassword) : null;

  if (isNew && !trimmedPassword) {
    throw new Error('비밀번호를 입력해주세요.');
  }

  const targetId = isNew ? 1 : existing.rows[0].id;
  let existingHash = !isNew ? existing.rows[0].password_hash : null;
  const hashPattern = /^[0-9a-f]{64}$/i;
  if (existingHash && !hashPattern.test(existingHash)) {
    const convertedHash = hashPassword(existingHash);
    if (convertedHash) {
      await db.query(
        `UPDATE superadmin
            SET password_hash = $1,
                last_modified = CURRENT_TIMESTAMP
          WHERE id = $2`,
        [convertedHash, targetId]
      );
      existingHash = convertedHash;
    }
  }
  const passwordForInsert = hashedPassword !== null
    ? hashedPassword
    : existingHash;

  const result = await db.query(
    `INSERT INTO superadmin (id, username, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (id)
       DO UPDATE SET
         username = EXCLUDED.username,
         password_hash = COALESCE(EXCLUDED.password_hash, superadmin.password_hash),
         last_modified = CURRENT_TIMESTAMP
       RETURNING id, username, created_at, last_modified`,
    [
      targetId,
      trimmedUsername,
      passwordForInsert
    ]
  );

  if (result.rows.length === 0) {
    throw new Error('슈퍼어드민 정보를 업데이트하지 못했습니다.');
  }

  const row = result.rows[0];

  await db.query(
    `DELETE FROM superadmin
     WHERE id <> $1`,
    [row.id]
  );
  return {
    id: row.id,
    username: row.username,
    created_at: row.created_at ? row.created_at.toISOString() : null,
    last_modified: row.last_modified ? row.last_modified.toISOString() : null
  };
}

// 가게 목록 조회
async function getStores(filterStoreId = null) {
  const params = [];
  let whereClause = '';

  if (filterStoreId) {
    params.push(filterStoreId);
    whereClause = 'WHERE s.id = $1';
  }

  const result = await db.query(`
    SELECT 
      s.id, s.name, s.subtitle, s.phone, s.address, s.status, s.subdomain,
      s.subdomain_status, s.subdomain_created_at, s.subdomain_last_modified,
      s."order", s.created_at, s.last_modified, s.paused_at,
      ss.delivery
    FROM stores s
    LEFT JOIN store_settings ss ON s.id = ss.store_id
    ${whereClause}
    ORDER BY s."order" ASC, s.created_at ASC
  `, params);
  
  return result.rows.map(row => {
    return {
      id: row.id,
      name: row.name, // 기존 호환성을 위해 추가
      subtitle: row.subtitle, // 기존 호환성을 위해 추가
      phone: row.phone, // 기존 호환성을 위해 추가
      address: row.address, // 기존 호환성을 위해 추가
      status: row.status, // 가게 상태 추가
      subdomain: row.subdomain, // 서브도메인 추가
      basic: {
        storeName: row.name,
        storeSubtitle: row.subtitle,
        storePhone: row.phone,
        storeAddress: row.address,
      },
    discount: {
      title: '',
      enabled: false,
      description: '',
    },
    delivery: {
      baeminUrl: row.delivery?.baeminUrl || '',
      ttaengUrl: row.delivery?.ttaengUrl || '',
      yogiyoUrl: row.delivery?.yogiyoUrl || '',
      coupangUrl: row.delivery?.coupangUrl || '',
      deliveryOrder: row.delivery?.deliveryOrder || [],
    },
    pickup: {
      title: '',
      enabled: false,
      description: '',
    },
    images: {
      mainLogo: '',
      menuImage: '',
    },
    businessHours: {},
    sectionOrder: [],
    qrCode: {
      url: '',
      filepath: '',
      createdAt: null,
    },
    createdAt: row.created_at,
    updatedAt: row.last_modified,
    };
  });
}

// 특정 가게 조회
async function getStoreById(storeId) {
  const result = await db.query(`
    SELECT 
      s.id, s.name, s.subtitle, s.phone, s.address, s.status, s.subdomain,
      s.subdomain_status, s.subdomain_created_at, s.subdomain_last_modified,
      s."order", s.created_at, s.last_modified, s.paused_at,
      ss.delivery
    FROM stores s
    LEFT JOIN store_settings ss ON s.id = ss.store_id
    WHERE s.id = $1
  `, [storeId]);
  
  if (result.rows.length === 0) {
    return null;
  }
  
  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name, // 기존 호환성을 위해 추가
    subtitle: row.subtitle, // 기존 호환성을 위해 추가
    phone: row.phone, // 기존 호환성을 위해 추가
    address: row.address, // 기존 호환성을 위해 추가
    subdomain: row.subdomain, // 서브도메인 추가
    basic: {
      storeName: row.name,
      storeSubtitle: row.subtitle,
      storePhone: row.phone,
      storeAddress: row.address,
    },
    discount: {
      title: '',
      enabled: false,
      description: '',
    },
    delivery: {
      baeminUrl: row.delivery?.baeminUrl || '',
      ttaengUrl: row.delivery?.ttaengUrl || '',
      yogiyoUrl: row.delivery?.yogiyoUrl || '',
      coupangUrl: row.delivery?.coupangUrl || '',
      deliveryOrder: row.delivery?.deliveryOrder || [],
    },
    pickup: {
      title: '',
      enabled: false,
      description: '',
    },
    images: {
      mainLogo: '',
      menuImage: '',
    },
    businessHours: {},
    sectionOrder: [],
    qrCode: {
      url: '',
      filepath: '',
      createdAt: null,
    },
    createdAt: row.created_at,
    updatedAt: row.last_modified,
  };
}

// 가게 설정 조회
async function getStoreSettings(storeId) {
  const result = await db.query(`
    SELECT basic, discount, delivery, pickup, images, business_hours, section_order, qr_code, domain_settings
    FROM store_settings
    WHERE store_id = $1
  `, [storeId]);
  
  if (result.rows.length === 0) {
    return {};
  }
  
  const settings = result.rows[0];
  return {
    basic: settings.basic || {},
    discount: settings.discount || {},
    delivery: settings.delivery || {},
    pickup: settings.pickup || {},
    images: settings.images || {},
    businessHours: settings.business_hours || {},
    sectionOrder: settings.section_order || {},
    qrCode: settings.qr_code || {},
    domainSettings: settings.domain_settings || {}
  };
}

// 현재 가게 ID 조회
async function getCurrentStoreId() {
  const result = await db.query(`
    SELECT store_id
    FROM current_store
    WHERE id = 1
  `);
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return result.rows[0].store_id;
}

// 활동 로그 조회
async function getActivityLogs() {
  const result = await db.query(`
    SELECT 
      id, type, action, description, user_id, user_name,
      target_type, target_id, target_name, details, timestamp
    FROM activity_logs
    ORDER BY timestamp DESC
    LIMIT 100
  `);
  
  return result.rows.map(log => ({
    id: log.id,
    type: log.type,
    action: log.action,
    description: log.description,
    userId: log.user_id,
    userName: log.user_name,
    targetType: log.target_type,
    targetId: log.target_id,
    targetName: log.target_name,
    details: log.details || {},
    timestamp: log.timestamp.toISOString()
  }));
}

// 릴리즈 노트 조회
async function getReleaseNotes() {
  const result = await db.query(`
    SELECT 
      id, version, codename, release_date, title, highlights,
      features, bug_fixes, technical_improvements, created_at
    FROM release_notes
    ORDER BY release_date DESC
  `);
  
  return result.rows.map(note => ({
    id: note.id,
    version: note.version,
    codename: note.codename,
    releaseDate: note.release_date.toISOString(),
    title: note.title,
    highlights: note.highlights || {},
    features: note.features || {},
    bugFixes: note.bug_fixes || {},
    technicalImprovements: note.technical_improvements || {},
    createdAt: note.created_at.toISOString()
  }));
}

// 가게 사장님 입점/계정 요청 생성
async function createOwnerRequest({
  name,
  email,
  phone,
  storeId = null,
  message = '',
  requestData = {},
  password
}) {
  const ownerId = `owner_${uuidv4()}`;
  const trimmedPassword = (password || '').trim();

  if (!trimmedPassword) {
    return {
      success: false,
      error: '비밀번호를 입력해주세요.'
    };
  }

  if (trimmedPassword.length < 8) {
    return {
      success: false,
      error: '비밀번호는 8자 이상 입력해주세요.'
    };
  }

  const passwordHash = hashPassword(trimmedPassword);

  const normalizedName = (name || '').trim().toLowerCase();
  const normalizedStoreName = (requestData.storeName || '').trim().toLowerCase();
  const sanitizedPhone = (phone || '').replace(/[^0-9]/g, '');

  if (normalizedName && normalizedStoreName && sanitizedPhone) {
    const duplicateCheck = await db.query(
      `SELECT o.id
         FROM store_owners o
         LEFT JOIN stores s ON o.store_id = s.id
        WHERE LOWER(TRIM(COALESCE(o.owner_name, ''))) = $1
          AND REGEXP_REPLACE(COALESCE(o.phone, ''), '[^0-9]', '', 'g') = $2
          AND LOWER(TRIM(COALESCE(o.request_data->>'storeName', s.name, ''))) = $3
        LIMIT 1`,
      [normalizedName, sanitizedPhone, normalizedStoreName]
    );

    if (duplicateCheck.rows.length > 0) {
      return {
        success: false,
        error: '이미 동일한 정보로 접수된 입점 요청이 있습니다. 담당자 확인을 기다려주세요.'
      };
    }
  }

  await db.query(
    `INSERT INTO store_owners (
        id, store_id, owner_name, email, phone, status,
        password_hash, request_message, request_data, created_at
     ) VALUES ($1, NULL, $2, $3, $4, 'pending', $5, $6, $7, CURRENT_TIMESTAMP)
    `,
    [
      ownerId,
      name,
      email,
      phone,
      passwordHash,
      message,
      JSON.stringify(requestData || {})
    ]
  );

  return {
    success: true,
    ownerId,
    status: 'pending',
    storeId: null
  };
}

// 가게 사장님 계정 목록 조회
async function getOwnerAccounts(status = null) {
  const params = [];
  let whereClause = '';

  if (status) {
    params.push(status);
    whereClause = 'WHERE o.status = $1';
  }

  const result = await db.query(
    `SELECT 
        o.id,
        o.store_id,
        o.owner_name,
        o.email,
        o.phone,
        o.status,
        o.request_message,
        o.request_data,
        o.created_at,
        o.approved_at,
        o.last_login,
        s.name AS store_name
     FROM store_owners o
     LEFT JOIN stores s ON o.store_id = s.id
     ${whereClause}
     ORDER BY o.created_at DESC`,
    params
  );

  return result.rows.map(row => ({
    id: row.id,
    storeId: row.store_id,
    storeName: row.store_name,
    ownerName: row.owner_name,
    email: row.email,
    phone: row.phone,
    status: row.status,
    requestMessage: row.request_message,
    requestData: row.request_data || {},
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    lastLogin: row.last_login
  }));
}

// 단일 점주 계정 조회
async function getOwnerAccountDetail(ownerId) {
  const result = await db.query(
    `SELECT id, store_id, owner_name, email, phone, status, request_message, request_data, password_hash
       FROM store_owners
      WHERE id = $1
      LIMIT 1`,
    [ownerId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  let requestData = row.request_data || {};
  if (requestData && typeof requestData === 'string') {
    try {
      requestData = JSON.parse(requestData);
    } catch (error) {
      requestData = {};
    }
  }

  return {
    id: row.id,
    storeId: row.store_id,
    ownerName: row.owner_name,
    email: row.email,
    phone: row.phone,
    status: row.status,
    requestMessage: row.request_message,
    requestData,
    passwordHash: row.password_hash
  };
}

// 가게 사장님 계정 승인
async function approveOwnerAccount(ownerId, { storeId, passwordHash }) {
  const result = await db.query(
    `UPDATE store_owners
        SET status = 'approved',
            store_id = $2,
            password_hash = $3,
            approved_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, owner_name, email, phone, store_id, status, approved_at`,
    [ownerId, storeId, passwordHash]
  );

  if (result.rows.length === 0) {
    throw new Error('점주 계정을 찾을 수 없습니다.');
  }

  if (storeId) {
    await db.query(
      `UPDATE stores
          SET status = 'active', last_modified = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [storeId]
    );
  }

  return result.rows[0];
}

// 가게 사장님 계정 거절/보류 처리
async function rejectOwnerAccount(ownerId, reason = '') {
  const existing = await db.query(
    `SELECT store_id, request_data FROM store_owners WHERE id = $1`,
    [ownerId]
  );

  if (existing.rows.length === 0) {
    throw new Error('점주 계정을 찾을 수 없습니다.');
  }

  const storeId = existing.rows[0].store_id;
  let requestData = existing.rows[0].request_data || {};
  if (requestData && typeof requestData === 'string') {
    try {
      requestData = JSON.parse(requestData);
    } catch (error) {
      requestData = {};
    }
  }

  requestData = requestData || {};
  requestData.rejectReason = reason;

  const result = await db.query(
    `UPDATE store_owners
        SET status = 'rejected',
            request_data = $2
      WHERE id = $1
      RETURNING id, owner_name, email, status` ,
    [ownerId, JSON.stringify(requestData)]
  );

  if (result.rows.length === 0) {
    throw new Error('점주 계정을 찾을 수 없습니다.');
  }

  if (storeId) {
    await db.query(
      `UPDATE stores
          SET status = 'rejected',
              last_modified = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [storeId]
    );
  }

  return result.rows[0];
}

async function pauseOwnerAccount(ownerId) {
  const result = await db.query(
    `UPDATE store_owners
        SET status = 'paused'
      WHERE id = $1
      RETURNING id, owner_name, email, phone, store_id, status, approved_at`,
    [ownerId]
  );

  if (result.rows.length === 0) {
    throw new Error('점주 계정을 찾을 수 없습니다.');
  }

  const storeId = result.rows[0].store_id;
  if (storeId) {
    await db.query(
      `UPDATE stores
          SET status = 'paused',
              paused_at = CURRENT_TIMESTAMP,
              last_modified = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [storeId]
    );
  }

  return result.rows[0];
}

async function resumeOwnerAccount(ownerId) {
  const result = await db.query(
    `UPDATE store_owners
        SET status = 'approved'
      WHERE id = $1
      RETURNING id, owner_name, email, phone, store_id, status, approved_at`,
    [ownerId]
  );

  if (result.rows.length === 0) {
    throw new Error('점주 계정을 찾을 수 없습니다.');
  }

  const storeId = result.rows[0].store_id;
  if (storeId) {
    await db.query(
      `UPDATE stores
          SET status = 'active',
              paused_at = NULL,
              last_modified = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [storeId]
    );
  }

  return result.rows[0];
}

async function deleteOwnerAccount(ownerId) {
  const existing = await db.query(
    `SELECT id, store_id FROM store_owners WHERE id = $1`,
    [ownerId]
  );

  if (existing.rows.length === 0) {
    throw new Error('점주 계정을 찾을 수 없습니다.');
  }

  const storeId = existing.rows[0].store_id;

  await db.query(
    `DELETE FROM store_owners WHERE id = $1`,
    [ownerId]
  );

  if (storeId) {
    await db.query(
      `UPDATE stores
          SET status = 'pending',
              last_modified = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [storeId]
    );
  }

  return { success: true, ownerId, storeId };
}

async function createStoreEvent({ storeId, eventType, eventPayload = {}, userAgent = null }) {
  if (!storeId || !eventType) {
    throw new Error('storeId와 eventType은 필수입니다.');
  }

  const payloadJson = JSON.stringify(eventPayload || {});

  const result = await db.query(
    `INSERT INTO store_events (store_id, event_type, event_payload, user_agent)
     VALUES ($1, $2, $3::jsonb, $4)
     RETURNING id, store_id, event_type, event_payload, created_at`,
    [storeId, eventType, payloadJson, userAgent]
  );

  return result.rows[0];
}

async function getEventSummary({ storeId = null, from = null, to = null }) {
  const now = new Date();
  const toDate = to ? new Date(to) : now;
  const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 6 * 24 * 60 * 60 * 1000);

  const rangeStart = new Date(fromDate);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(toDate);
  rangeEnd.setHours(23, 59, 59, 999);

  const totalsResult = await db.query(
    `SELECT event_type, COUNT(*)::int AS count
       FROM store_events
      WHERE ($1::varchar IS NULL OR store_id = $1)
        AND created_at BETWEEN $2 AND $3
      GROUP BY event_type`,
    [storeId, rangeStart, rangeEnd]
  );

  const dailyResult = await db.query(
    `SELECT date_trunc('day', created_at) AS day,
            event_type,
            COUNT(*)::int AS count
       FROM store_events
      WHERE ($1::varchar IS NULL OR store_id = $1)
        AND created_at BETWEEN $2 AND $3
      GROUP BY day, event_type
      ORDER BY day ASC`,
    [storeId, rangeStart, rangeEnd]
  );

  const totals = {};
  totalsResult.rows.forEach(row => {
    totals[row.event_type] = row.count;
  });

  const daily = {};
  dailyResult.rows.forEach(row => {
    const dayKey = row.day.toISOString().split('T')[0];
    if (!daily[dayKey]) {
      daily[dayKey] = {};
    }
    daily[dayKey][row.event_type] = row.count;
  });

  return {
    success: true,
    storeId,
    range: {
      from: rangeStart.toISOString(),
      to: rangeEnd.toISOString()
    },
    totals,
    daily
  };
}

async function getEventTotalsByStore({ from = null, to = null, search = '', limit = 100 }) {
  const now = new Date();
  const toDate = to ? new Date(to) : now;
  const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 6 * 24 * 60 * 60 * 1000);

  const rangeStart = new Date(fromDate);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(toDate);
  rangeEnd.setHours(23, 59, 59, 999);

  const params = [rangeStart, rangeEnd];
  const whereClauses = [];
  const searchTerm = (search || '').trim().toLowerCase();

  if (searchTerm) {
    params.push(`%${searchTerm}%`);
    const idx = params.length;
    whereClauses.push(`(LOWER(COALESCE(s.name, '')) LIKE $${idx} OR LOWER(COALESCE(s.subdomain, '')) LIKE $${idx})`);
  }

  params.push(Math.min(Math.max(parseInt(limit, 10) || 100, 10), 500));
  const limitIdx = params.length;

  const sql = `
    SELECT
      s.id,
      s.name,
      COALESCE(s.subdomain, '') AS subdomain,
      s.status,
      COALESCE(COUNT(e.id), 0)::int AS total_events,
      COALESCE(COUNT(*) FILTER (WHERE e.event_type = 'page_view'), 0)::int AS page_views,
      COALESCE(COUNT(*) FILTER (WHERE e.event_type = 'call_click'), 0)::int AS call_clicks,
      COALESCE(COUNT(*) FILTER (WHERE e.event_type = 'menu_view'), 0)::int AS menu_views,
      COALESCE(COUNT(*) FILTER (WHERE e.event_type = 'delivery_click'), 0)::int AS delivery_clicks,
      MAX(e.created_at) AS last_event_at
    FROM stores s
    LEFT JOIN store_events e
      ON e.store_id = s.id
     AND e.created_at BETWEEN $1 AND $2
    ${whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : ''}
    GROUP BY s.id, s.name, s.subdomain, s.status
    ORDER BY page_views DESC, s.name ASC
    LIMIT $${limitIdx}
  `;

  const result = await db.query(sql, params);

  return result.rows.map(row => ({
    storeId: row.id,
    storeName: row.name,
    subdomain: row.subdomain,
    status: row.status,
    totalEvents: row.total_events,
    pageViews: row.page_views,
    callClicks: row.call_clicks,
    menuViews: row.menu_views,
    deliveryClicks: row.delivery_clicks,
    lastEventAt: row.last_event_at ? new Date(row.last_event_at).toISOString() : null
  }));
}

async function getReleaseNotes({ limit = 10 } = {}) {
  const numericLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
  const result = await db.query(
    `SELECT
        version,
        codename,
        release_date,
        title,
        highlights,
        features,
        bug_fixes,
        technical_improvements
     FROM release_notes
     ORDER BY release_date DESC
     LIMIT $1`,
    [numericLimit]
  );

  return result.rows || [];
}

// 가게 사장님 로그인 처리
async function authenticateStoreOwner(email, password) {
  const result = await db.query(
    `SELECT id, owner_name, email, phone, status, password_hash, store_id, created_at
       FROM store_owners
      WHERE email = $1
      ORDER BY 
        CASE 
          WHEN status = 'approved' THEN 0
          WHEN status = 'pending' THEN 1
          WHEN status = 'rejected' THEN 2
          ELSE 3
        END,
        created_at DESC
      LIMIT 1`,
    [email]
  );

  if (result.rows.length === 0) {
    return { success: false, error: '등록되지 않은 계정입니다.' };
  }

  const owner = result.rows[0];

  if (owner.status !== 'approved') {
    return { success: false, error: '아직 승인되지 않은 계정입니다.' };
  }

  if (!owner.password_hash) {
    return { success: false, error: '계정이 아직 활성화되지 않았습니다.' };
  }

  const hashedInput = hashPassword(password);
  const storedHash = owner.password_hash;
  const hashPattern = /^[0-9a-f]{64}$/i;
  const isStoredHashed = hashPattern.test(storedHash || '');

  if (isStoredHashed) {
    if (storedHash !== hashedInput) {
      return { success: false, error: '비밀번호가 일치하지 않습니다.' };
    }
  } else if (storedHash !== password) {
    return { success: false, error: '비밀번호가 일치하지 않습니다.' };
  }

  return {
    success: true,
    owner: {
      id: owner.id,
      name: owner.owner_name,
      email: owner.email,
      phone: owner.phone,
      storeId: owner.store_id
    }
  };
}

// 점주 로그인 기록
async function recordOwnerLogin(ownerId) {
  await db.query(
    `UPDATE store_owners
        SET last_login = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [ownerId]
  );
}

// 가게별 점주 조회
async function getOwnersByStore(storeId) {
  const result = await db.query(
    `SELECT id, owner_name, email, phone, status, created_at, last_login
       FROM store_owners
      WHERE store_id = $1
      ORDER BY created_at DESC`,
    [storeId]
  );

  return result.rows;
}

// 가게 설정 업데이트
async function updateStoreSettings(storeId, settings) {
  try {
    console.log(`가게 설정 업데이트 시도: ${storeId}`, settings);
    
    // store_settings 테이블에서 해당 가게의 설정을 찾거나 생성
    const existingSettings = await db.query(
      'SELECT id FROM store_settings WHERE store_id = $1',
      [storeId]
    );
    
    // 기본 정보 업데이트 (stores 테이블)
    if (settings.basic) {
      await db.query(`
        UPDATE stores 
        SET 
          name = $2,
          subtitle = $3,
          phone = $4,
          address = $5,
          last_modified = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [
        storeId,
        settings.basic.storeName || '',
        settings.basic.storeSubtitle || '',
        settings.basic.storePhone || '',
        settings.basic.storeAddress || ''
      ]);
    }

    if (existingSettings.rows.length > 0) {
      // 기존 설정 업데이트
      await db.query(`
        UPDATE store_settings 
        SET 
          delivery = $2,
          discount = $3,
          pickup = $4,
          images = $5,
          business_hours = $6,
          section_order = $7,
          qr_code = $8,
          domain_settings = $9,
          updated_at = CURRENT_TIMESTAMP
        WHERE store_id = $1
      `, [
        storeId,
        JSON.stringify(settings.delivery || {}),
        JSON.stringify(settings.discount || {}),
        JSON.stringify(settings.pickup || {}),
        JSON.stringify(settings.images || {}),
        JSON.stringify(settings.businessHours || {}),
        JSON.stringify(settings.sectionOrder || []),
        JSON.stringify(settings.qrCode || {}),
        JSON.stringify(settings.domainSettings || {})
      ]);
    } else {
      // 새 설정 생성
      await db.query(`
        INSERT INTO store_settings (
          store_id, delivery, discount, pickup, images, 
          business_hours, section_order, qr_code, domain_settings, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [
        storeId,
        JSON.stringify(settings.delivery || {}),
        JSON.stringify(settings.discount || {}),
        JSON.stringify(settings.pickup || {}),
        JSON.stringify(settings.images || {}),
        JSON.stringify(settings.businessHours || {}),
        JSON.stringify(settings.sectionOrder || []),
        JSON.stringify(settings.qrCode || {}),
        JSON.stringify(settings.domainSettings || {})
      ]);
    }
    
    console.log(`가게 설정 업데이트 완료: ${storeId}`);
    return { success: true, storeId };
  } catch (error) {
    console.error('가게 설정 업데이트 실패:', error);
    throw error;
  }
}

// 전체 데이터 조회 (기존 API 호환성)
async function getAllData() {
  const [superadmin, stores, currentStoreId] = await Promise.all([
    getSuperAdmin(),
    getStores(),
    getCurrentStoreId()
  ]);
  
  // 가게 설정들 조회
  const settings = {};
  const storesObj = {};
  
  for (const store of stores) {
    storesObj[store.id] = store;
    settings[store.id] = await getStoreSettings(store.id);
  }
  
  return {
    superadmin,
    stores: stores, // 배열로 반환 (프론트엔드 호환성)
    currentStoreId,
    settings,
    deliveryOrders: {}, // 기존 구조 유지
    images: {} // 기존 구조 유지
  };
}

// 슈퍼어드민 인증
async function authenticateSuperAdmin(username, password) {
  const result = await db.query(`
    SELECT id, username, password_hash
    FROM superadmin
    WHERE username = $1
  `, [username]);
  
  if (result.rows.length === 0) {
    return { success: false, error: '사용자를 찾을 수 없습니다.' };
  }
  
  const admin = result.rows[0];

  if (!password || !admin.password_hash) {
    return { success: false, error: '비밀번호가 일치하지 않습니다.' };
  }

  const hashPattern = /^[0-9a-f]{64}$/i;
  if (hashPattern.test(admin.password_hash)) {
    const hashedInput = hashPassword(password);
    if (admin.password_hash !== hashedInput) {
      return { success: false, error: '비밀번호가 일치하지 않습니다.' };
    }
  } else {
    if (admin.password_hash !== password) {
      return { success: false, error: '비밀번호가 일치하지 않습니다.' };
    }
    const hashed = hashPassword(password);
    await db.query(
      `UPDATE superadmin
          SET password_hash = $1,
              last_modified = CURRENT_TIMESTAMP
        WHERE id = $2`,
      [hashed, admin.id]
    );
  }
  
  return { success: true, token: 'admin_token_' + Date.now() };
}

// 현재 가게 ID 설정
async function setCurrentStoreId(storeId) {
  try {
    console.log(`현재 가게 ID 설정 시도: ${storeId}`);
    
    // current_store 테이블에 저장 (UPSERT)
    await db.query(`
      INSERT INTO current_store (id, store_id) 
      VALUES (1, $1) 
      ON CONFLICT (id) 
      DO UPDATE SET store_id = $1, updated_at = CURRENT_TIMESTAMP
    `, [storeId]);
    
    console.log(`현재 가게 ID 설정 완료: ${storeId}`);
    return { success: true, storeId };
  } catch (error) {
    console.error('현재 가게 ID 설정 실패:', error);
    throw error;
  }
}

// 서브도메인으로 가게 조회
async function getStoreBySubdomain(subdomain) {
  try {
    // 먼저 stores 테이블에서 서브도메인으로 조회
    let result = await db.query(`
      SELECT 
        s.id, s.name, s.subtitle, s.phone, s.address, s.status, s.subdomain,
        s.subdomain_status, s.subdomain_created_at, s.subdomain_last_modified,
        s."order", s.created_at, s.last_modified, s.paused_at
      FROM stores s
      WHERE s.subdomain = $1
      LIMIT 1
    `, [subdomain]);
    
    // stores 테이블에서 찾지 못한 경우 store_settings 테이블에서 조회
    if (result.rows.length === 0) {
      result = await db.query(`
        SELECT 
          s.id, s.name, s.subtitle, s.phone, s.address, s.status, s.subdomain,
          s.subdomain_status, s.subdomain_created_at, s.subdomain_last_modified,
          s."order", s.created_at, s.last_modified, s.paused_at
        FROM stores s
        JOIN store_settings ss ON s.id = ss.store_id
        WHERE ss.domain_settings->>'subdomain' = $1
        LIMIT 1
      `, [subdomain]);
    }
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0];
  } catch (error) {
    console.error('서브도메인으로 가게 조회 실패:', error);
    throw error;
  }
}

// 활동 로그 생성
async function createActivityLog(logEntry) {
  try {
    const result = await db.query(`
      INSERT INTO activity_logs (id, type, action, description, user_id, user_name, target_type, target_id, target_name, details, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      logEntry.id,
      logEntry.logType || 'basic',
      logEntry.action,
      logEntry.description || '',
      logEntry.user || 'admin',
      logEntry.user || 'admin',
      'store',
      logEntry.storeId,
      '', // target_name은 나중에 가게명으로 업데이트
      JSON.stringify(logEntry.details || {}),
      logEntry.timestamp
    ]);
    
    return result.rows[0];
  } catch (error) {
    console.error('활동 로그 생성 실패:', error);
    throw error;
  }
}

// 가게 생성
async function createStore(storeData = {}) {
  try {
    const storeId = `store_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    const status = storeData.status || 'active';
    const basicInfo = storeData.basic || {
      storeName: storeData.name || '',
      storeSubtitle: storeData.subtitle || '',
      storePhone: storeData.phone || '',
      storeAddress: storeData.address || ''
    };
    
    const result = await db.query(`
      INSERT INTO stores (id, name, subtitle, phone, address, status, subdomain, subdomain_status, subdomain_created_at, subdomain_last_modified, "order", created_at, last_modified, paused_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      storeId,
      storeData.name || '',
      storeData.subtitle || '',
      storeData.phone || '',
      storeData.address || '',
      status,
      storeData.subdomain && storeData.subdomain.trim() !== '' ? storeData.subdomain : null,
      'inactive',
      null,
      null,
      0,
      now,
      now,
      null
    ]);
    
    // 기본 설정 생성
    await db.query(`
      INSERT INTO store_settings (store_id, basic, discount, delivery, pickup, images, business_hours, section_order, qr_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      storeId,
      JSON.stringify(basicInfo),
      JSON.stringify({}),
      JSON.stringify({}),
      JSON.stringify({}),
      JSON.stringify({}),
      JSON.stringify({}),
      JSON.stringify([
        { id: 'delivery', icon: 'discount', title: '배달 주문' },
        { id: 'discount', icon: 'discount', title: '할인 안내' },
        { id: 'address', icon: 'discount', title: '주소 정보' }
      ]),
      JSON.stringify({})
    ]);
    
    return result.rows[0];
  } catch (error) {
    console.error('가게 생성 실패:', error);
    throw error;
  }
}

// 가게 수정
async function updateStore(storeId, storeData) {
  try {
    const now = new Date().toISOString();
    
    const result = await db.query(`
      UPDATE stores 
      SET name = $2, subtitle = $3, phone = $4, address = $5, subdomain = $6, last_modified = $7
      WHERE id = $1
      RETURNING *
    `, [
      storeId,
      storeData.name || '',
      storeData.subtitle || '',
      storeData.phone || '',
      storeData.address || '',
      storeData.subdomain && storeData.subdomain.trim() !== '' ? storeData.subdomain : null,
      now
    ]);
    
    if (result.rows.length === 0) {
      throw new Error('가게를 찾을 수 없습니다.');
    }
    
    return result.rows[0];
  } catch (error) {
    console.error('가게 수정 실패:', error);
    throw error;
  }
}

// 가게 삭제
async function deleteStore(storeId) {
  try {
    // 가게 존재 여부 확인
    const store = await db.query('SELECT id FROM stores WHERE id = $1', [storeId]);
    if (store.rows.length === 0) {
      throw new Error('가게를 찾을 수 없습니다.');
    }
    
    // 가게 삭제 (CASCADE로 store_settings도 자동 삭제됨)
    await db.query('DELETE FROM stores WHERE id = $1', [storeId]);
    
    return { success: true, message: '가게가 삭제되었습니다.' };
  } catch (error) {
    console.error('가게 삭제 실패:', error);
    throw error;
  }
}

// 가게 일시정지
async function pauseStore(storeId) {
  try {
    const now = new Date().toISOString();
    
    const result = await db.query(`
      UPDATE stores 
      SET status = 'paused', paused_at = $2, last_modified = $2
      WHERE id = $1
      RETURNING *
    `, [storeId, now]);
    
    if (result.rows.length === 0) {
      throw new Error('가게를 찾을 수 없습니다.');
    }
    
    return result.rows[0];
  } catch (error) {
    console.error('가게 일시정지 실패:', error);
    throw error;
  }
}

// 가게 재개
async function resumeStore(storeId) {
  try {
    const now = new Date().toISOString();
    
    const result = await db.query(`
      UPDATE stores 
      SET status = 'active', paused_at = NULL, last_modified = $2
      WHERE id = $1
      RETURNING *
    `, [storeId, now]);
    
    if (result.rows.length === 0) {
      throw new Error('가게를 찾을 수 없습니다.');
    }
    
    return result.rows[0];
  } catch (error) {
    console.error('가게 재개 실패:', error);
    throw error;
  }
}

module.exports = {
  getSuperAdmin,
  getStores,
  getStoreById,
  getStoreBySubdomain,
  getStoreSettings,
  updateStoreSettings,
  getCurrentStoreId,
  setCurrentStoreId,
  getActivityLogs,
  createActivityLog,
  createStore,
  updateStore,
  deleteStore,
  pauseStore,
  resumeStore,
  getReleaseNotes,
  getAllData,
  authenticateSuperAdmin,
  updateSuperAdminAccount,
  createOwnerRequest,
  getOwnerAccounts,
  approveOwnerAccount,
  rejectOwnerAccount,
  authenticateStoreOwner,
  recordOwnerLogin,
  getOwnersByStore,
  getOwnerAccountDetail,
  hashPassword,
  pauseOwnerAccount,
  resumeOwnerAccount,
  deleteOwnerAccount,
  createStoreEvent,
  getEventSummary,
  getEventTotalsByStore,
  getReleaseNotes
};
