/**
 * 데이터베이스 서비스 모듈
 * 기존 API 서버에서 사용할 데이터베이스 서비스
 *
 * @author DOCORE
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../env.database') });

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const db = require('./connection');

let historyTablesEnsured = false;
let singleOwnerConstraintEnsured = false;
let storeSettingsColumnsEnsured = false;
let historyTablesAvailable = true;
let storeSettingsColumnsAvailable = true;

// 백엔드 메모리 캐싱 (TTL 기반) - DB 요청 최소화
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5분

function getCacheKey(type, id) {
  return `${type}:${id}`;
}

function getCached(key) {
  const cached = cache.get(key);
  if (!cached) return null;
  
  if (Date.now() > cached.expiresAt) {
    cache.delete(key);
    return null;
  }
  
  return cached.data;
}

function setCache(key, data, ttl = CACHE_TTL) {
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttl
  });
}

function clearCache(pattern = null) {
  if (!pattern) {
    cache.clear();
    return;
  }
  
  for (const key of cache.keys()) {
    if (key.startsWith(pattern)) {
      cache.delete(key);
    }
  }
}

// 캐시 정리 (1시간마다 만료된 항목 제거)
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now > value.expiresAt) {
      cache.delete(key);
    }
  }
}, 60 * 60 * 1000); // 1시간마다

function hashPassword(password) {
  const trimmed = (password || '').trim();
  if (!trimmed) {
    return null;
  }
  return crypto.createHash('sha256').update(trimmed).digest('hex');
}

let legacyDataCache = null;
let legacySuperadminCache = null;

function loadLegacyData() {
  if (legacyDataCache) {
    return legacyDataCache;
  }

  try {
    const dataPath = path.resolve(__dirname, '../../assets/data/data.json');
    const raw = fs.readFileSync(dataPath, 'utf-8');
    legacyDataCache = JSON.parse(raw);
    return legacyDataCache;
  } catch (error) {
    console.warn('⚠️ 레거시 데이터 파일을 불러오지 못했습니다.', error?.message);
    legacyDataCache = null;
    return null;
  }
}

function getLegacySuperadmin() {
  if (legacySuperadminCache) {
    return legacySuperadminCache;
  }

  const legacyData = loadLegacyData();
  const legacy = legacyData?.superadmin;

  if (!legacy || !legacy.username || !legacy.password) {
    legacySuperadminCache = null;
    return null;
  }

  const normalizedUsername = legacy.username.trim();
  const passwordHash = /^[0-9a-f]{64}$/i.test(legacy.password)
    ? legacy.password
    : hashPassword(legacy.password);

  legacySuperadminCache = {
    username: normalizedUsername,
    passwordHash
  };

  return legacySuperadminCache;
}

const PHONE_DISPLAY_PATTERN = /^0\d{1,2}-\d{3,4}-\d{4}$/;
const ADDRESS_ALLOWED_PATTERN = /^[가-힣A-Za-z0-9\s\-.,#/()]+$/;

function normalizePhoneNumber(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 11) {
    return '';
  }

  if (digits.startsWith('02')) {
    if (digits.length === 9) {
      return `02-${digits.slice(2, 5)}-${digits.slice(5)}`;
    }
    if (digits.length === 10) {
      return `02-${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    return '';
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  return '';
}

function sanitizeAddressSegment(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function getStoresByOwner(ownerId) {
  const result = await db.query(
    `SELECT 
        sol.store_id,
        sol.role,
        sol.created_at,
        s.name,
        s.status,
        CASE WHEN so.store_id = sol.store_id THEN TRUE ELSE FALSE END AS is_primary
     FROM store_owner_links sol
     LEFT JOIN stores s ON sol.store_id = s.id
     LEFT JOIN store_owners so ON so.id = sol.owner_id
    WHERE sol.owner_id = $1
    ORDER BY s.name ASC NULLS LAST, sol.created_at ASC`,
    [ownerId]
  );

  return result.rows.map(row => ({
    id: row.store_id,
    name: row.name || null,
    status: row.status || null,
    role: row.role || 'manager',
    linkedAt: row.created_at,
    isPrimary: row.is_primary || false
  }));
}

async function getOwnersByStore(storeId) {
  const result = await db.query(
    `SELECT 
        o.id,
        o.owner_name,
        o.email,
        o.phone,
        o.status,
        o.approved_at,
        o.last_login,
        sol.role,
        sol.created_at,
        CASE WHEN o.store_id = $1 THEN TRUE ELSE FALSE END AS is_primary
     FROM store_owner_links sol
     JOIN store_owners o ON sol.owner_id = o.id
    WHERE sol.store_id = $1
    ORDER BY o.owner_name ASC NULLS LAST, o.email ASC`,
    [storeId]
  );

  return result.rows.map(row => ({
    id: row.id,
    ownerName: row.owner_name,
    email: row.email,
    phone: row.phone,
    status: row.status,
    approvedAt: row.approved_at,
    lastLogin: row.last_login,
    role: 'primary',
    linkedAt: row.created_at,
    isPrimary: row.is_primary
  }));
}

async function linkOwnerToStore(ownerId, storeId, options = {}) {
  if (!ownerId || !storeId) {
    throw new Error('ownerId와 storeId는 필수입니다.');
  }

  await ensureSingleOwnerConstraint();

  const normalizedRole = typeof options.role === 'string' && options.role.trim()
    ? options.role.trim().toLowerCase()
    : 'manager';
  const makePrimary = Boolean(options.makePrimary);
  const resolvedRole = makePrimary ? 'primary' : normalizedRole;

  await db.transaction(async client => {
    const ownerResult = await client.query(
      `SELECT id, status
         FROM store_owners
        WHERE id = $1`,
      [ownerId]
    );

    if (ownerResult.rows.length === 0) {
      throw new Error('존재하지 않는 점주 계정입니다.');
    }

    const ownerRecord = ownerResult.rows[0];
    if (!['active', 'suspended'].includes(ownerRecord.status)) {
      throw new Error('운영 중이거나 일시 중지된 점주 계정만 연결할 수 있습니다.');
    }

    await client.query(
      `INSERT INTO store_owner_links (owner_id, store_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (owner_id, store_id)
       DO UPDATE SET role = EXCLUDED.role`,
      [ownerId, storeId, resolvedRole]
    );

    if (makePrimary) {
      await client.query(
        `UPDATE store_owner_links
            SET role = CASE WHEN owner_id = $1 THEN 'primary' ELSE 'manager' END
          WHERE store_id = $2`,
        [ownerId, storeId]
      );

      await client.query(
        `UPDATE store_owners
            SET store_id = $2
          WHERE id = $1`,
        [ownerId, storeId]
      );
    } else {
      const currentPrimary = await client.query(
        `SELECT store_id
           FROM store_owners
          WHERE id = $1`,
        [ownerId]
      );

      if (!currentPrimary.rows.length || !currentPrimary.rows[0].store_id) {
        await client.query(
          `UPDATE store_owners
              SET store_id = $2
            WHERE id = $1`,
          [ownerId, storeId]
        );
      }
    }

    await client.query(
      `UPDATE stores
          SET last_modified = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [storeId]
    );
  });

  return { ownerId, storeId, role: resolvedRole, primary: makePrimary };
}

async function unlinkOwnerFromStore(ownerId, storeId) {
  if (!ownerId || !storeId) {
    throw new Error('ownerId와 storeId는 필수입니다.');
  }

  await db.query(
    `DELETE FROM store_owner_links
      WHERE owner_id = $1 AND store_id = $2`,
    [ownerId, storeId]
  );

  await db.query(
    `UPDATE store_owners
        SET store_id = CASE WHEN store_id = $2 THEN NULL ELSE store_id END
      WHERE id = $1`,
    [ownerId, storeId]
  );

  const remainingOwners = await db.query(
    `SELECT COUNT(*)::int AS cnt
       FROM store_owner_links
      WHERE store_id = $1`,
    [storeId]
  );

  if ((remainingOwners.rows[0]?.cnt || 0) === 0) {
    await db.query(
      `UPDATE stores
          SET status = CASE WHEN status = 'active' THEN 'pending' ELSE status END,
              last_modified = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [storeId]
    );
  }

  return { ownerId, storeId };
}

async function setPrimaryOwnerForStore(ownerId, storeId) {
  return linkOwnerToStore(ownerId, storeId, { role: 'primary', makePrimary: true });
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

// 가게 목록 조회 (페이지네이션 및 필터 지원)
// 가게 목록이 실패 없이 반환되도록 SQL을 정규화하고 중복 데이터를 제거한다.
async function getStores(options = {}) {
  const normalizedOptions = (options && typeof options === 'object' && !Array.isArray(options))
    ? { ...options }
    : options
      ? { storeId: options }
      : {};

  const defaultOptions = {
    storeId: null,
    ownerId: null,
    status: '',
    keyword: '',
    createdDate: '',
    page: 1,
    pageSize: 20,
    sortBy: 'createdAt',
    sortOrder: undefined,
    includeSummary: true
  };

  const finalOptions = { ...defaultOptions, ...normalizedOptions };
  if (!finalOptions.sortOrder) {
    finalOptions.sortOrder = finalOptions.sortBy === 'name' ? 'asc' : 'desc';
  }

  const safePage = Math.max(parseInt(finalOptions.page, 10) || 1, 1);
  const safePageSize = Math.min(Math.max(parseInt(finalOptions.pageSize, 10) || 20, 1), 100);
  const normalizedSortOrder = (finalOptions.sortOrder || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const normalizedKeyword = (finalOptions.keyword || '').trim().toLowerCase();
  const normalizedStatus = (finalOptions.status || '').trim();
  const normalizedCreatedDate = (finalOptions.createdDate || '').trim();
  const normalizedOwnerId = (finalOptions.ownerId || '').trim();
  const normalizedStoreId = (finalOptions.storeId || '').trim();

  const baseParams = [];
  const baseClauses = [];
  let ownerJoinClause = '';

  if (normalizedStoreId) {
    baseParams.push(normalizedStoreId);
    baseClauses.push(`s.id = $${baseParams.length}`);
  }

  if (normalizedOwnerId) {
    if (normalizedOwnerId === '__unassigned') {
      ownerJoinClause = 'LEFT JOIN store_owner_links sol ON sol.store_id = s.id';
      baseClauses.push('sol.owner_id IS NULL');
    } else {
      ownerJoinClause = 'JOIN store_owner_links sol ON sol.store_id = s.id';
      baseParams.push(normalizedOwnerId);
      baseClauses.push(`sol.owner_id = $${baseParams.length}`);
    }
  }

  if (normalizedKeyword) {
    baseParams.push(`%${normalizedKeyword}%`);
    const idx = baseParams.length;
    baseClauses.push(`(
      LOWER(COALESCE(s.name, '')) LIKE $${idx} OR
      LOWER(COALESCE(s.subtitle, '')) LIKE $${idx} OR
      LOWER(COALESCE(s.address, '')) LIKE $${idx} OR
      LOWER(COALESCE(s.phone, '')) LIKE $${idx} OR
      LOWER(COALESCE(s.subdomain, '')) LIKE $${idx}
    )`);
  }

  if (normalizedCreatedDate) {
    const referenceDate = normalizedCreatedDate === 'today'
      ? new Date().toISOString().split('T')[0]
      : normalizedCreatedDate.slice(0, 10);
    baseParams.push(referenceDate);
    baseClauses.push(`DATE(s.created_at) = $${baseParams.length}`);
  }

  const baseWhere = baseClauses.length ? `WHERE ${baseClauses.join(' AND ')}` : '';

  const filterParams = baseParams.slice();
  const filterClauses = baseClauses.slice();

  if (normalizedStatus) {
    filterParams.push(normalizedStatus);
    filterClauses.push(`s.status = $${filterParams.length}`);
  }

  const filterWhere = filterClauses.length ? `WHERE ${filterClauses.join(' AND ')}` : '';

  const sortColumnMap = {
    name: 's.name',
    createdAt: 's.created_at',
    lastModified: 's.last_modified',
    status: 's.status'
  };
  const sortColumn = sortColumnMap[finalOptions.sortBy] || 's.created_at';
  const orderClause = `ORDER BY ${sortColumn} ${normalizedSortOrder}, s.created_at DESC`;

  // COUNT와 Summary를 하나의 쿼리로 통합하여 성능 최적화
  const countAndSummarySql = finalOptions.includeSummary !== false
    ? `
      WITH filtered_ids AS (
        SELECT DISTINCT s.id, s.status, s.created_at
        FROM stores s
        ${ownerJoinClause}
        ${filterWhere}
      )
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active,
        COUNT(*) FILTER (WHERE status = 'paused')::int AS paused,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE)::int AS today
      FROM filtered_ids
    `
    : `
      SELECT COUNT(*)::int AS total
      FROM (
        SELECT DISTINCT s.id
        FROM stores s
        ${ownerJoinClause}
        ${filterWhere}
      ) filtered_ids
    `;

  const countResult = await db.query(countAndSummarySql, filterParams);
  const countRow = countResult.rows?.[0] || {};
  const total = Number(countRow.total || 0);
  
  const summary = finalOptions.includeSummary !== false
    ? {
        total,
        active: Number(countRow.active || 0),
        paused: Number(countRow.paused || 0),
        pending: Number(countRow.pending || 0),
        today: Number(countRow.today || 0)
      }
    : {
        total,
        active: 0,
        paused: 0,
        pending: 0,
        today: 0
      };

  const totalPages = total > 0 ? Math.ceil(total / safePageSize) : 0;
  const resolvedPage = totalPages > 0 ? Math.min(safePage, totalPages) : 1;
  const offset = (resolvedPage - 1) * safePageSize;
  const startRow = offset + 1;
  const endRow = offset + safePageSize;

  const dataRows = [];

  if (total > 0) {
    const startIdx = filterParams.length + 1;
    const endIdx = filterParams.length + 2;
    const dataSql = `
      WITH filtered AS (
        SELECT
          s.id,
          s.name,
          s.subtitle,
          s.phone,
          s.address,
          s.status,
          s.subdomain,
          s.subdomain_status,
          s.subdomain_created_at,
          s.subdomain_last_modified,
          s."order",
          s.created_at,
          s.last_modified,
          s.paused_at,
          ROW_NUMBER() OVER (${orderClause}) AS row_number
        FROM stores s
        ${ownerJoinClause}
        ${filterWhere}
      ),
      page AS (
        SELECT *
        FROM filtered
        WHERE row_number BETWEEN $${startIdx} AND $${endIdx}
      ),
      owner_list AS (
        SELECT
          p.id AS store_id,
          json_agg(
            json_build_object(
              'id', o.id,
              'ownerName', o.owner_name,
              'email', o.email,
              'phone', o.phone,
              'status', o.status,
              'approvedAt', o.approved_at,
              'lastLogin', o.last_login,
              'role', COALESCE(sol.role, 'manager'),
              'isPrimary', CASE WHEN o.store_id = sol.store_id THEN TRUE ELSE FALSE END,
              'linkedAt', sol.created_at
            )
            ORDER BY o.owner_name ASC NULLS LAST, o.email ASC
          ) FILTER (WHERE o.id IS NOT NULL) AS owners
        FROM page p
        LEFT JOIN store_owner_links sol ON sol.store_id = p.id
        LEFT JOIN store_owners o ON sol.owner_id = o.id
        GROUP BY p.id
      )
      SELECT
        p.id,
        p.name,
        p.subtitle,
        p.phone,
        p.address,
        p.status,
        p.subdomain,
        p.subdomain_status,
        p.subdomain_created_at,
        p.subdomain_last_modified,
        p."order",
        p.created_at,
        p.last_modified,
        p.paused_at,
        -- 설정 데이터는 리스트 조회 시 제외 (성능 최적화)
        -- 필요한 경우 별도 API로 조회하도록 변경
        COALESCE(owner_list.owners, '[]'::json) AS owners,
        p.row_number
      FROM page p
      LEFT JOIN owner_list ON owner_list.store_id = p.id
      ORDER BY p.row_number
    `;

    const dataResult = await db.query(dataSql, [...filterParams, startRow, endRow]);
    dataRows.push(...dataResult.rows);
  }

  const toPlainObject = (raw, fallback) => {
    if (!raw) return fallback;
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch (error) {
        return fallback;
      }
    }
    if (typeof raw === 'object') {
      return raw;
    }
    return fallback;
  };

  const data = dataRows.map(row => {
    const owners = Array.isArray(row.owners) ? row.owners : [];

    return {
      id: row.id,
      name: row.name,
      subtitle: row.subtitle,
      phone: row.phone,
      address: row.address,
      status: row.status,
      subdomain: row.subdomain,
      subdomainStatus: row.subdomain_status,
      subdomain_status: row.subdomain_status,
      subdomainCreatedAt: row.subdomain_created_at,
      subdomain_created_at: row.subdomain_created_at,
      subdomainLastModified: row.subdomain_last_modified,
      subdomain_last_modified: row.subdomain_last_modified,
      // 기본 정보는 stores 테이블에서 직접 가져온 값 사용
      basic: {
        storeName: row.name || '',
        storeSubtitle: row.subtitle || '',
        storePhone: row.phone || '',
        storeAddress: row.address || ''
      },
      // 설정 데이터는 리스트 조회 시 제외 (성능 최적화)
      // 필요한 경우 별도 API(/api/settings?storeId=xxx)로 조회
      discount: { title: '', enabled: false, description: '' },
      delivery: { baeminUrl: '', ttaengUrl: '', yogiyoUrl: '', coupangUrl: '', deliveryOrder: [] },
      pickup: { title: '', enabled: false, description: '' },
      images: { mainLogo: '', menuImage: '' },
      businessHours: {},
      sectionOrder: [],
      qrCode: { url: '', filepath: '', createdAt: null },
      createdAt: row.created_at,
      updatedAt: row.last_modified,
      owners
    };
  });

  return {
    data,
    meta: {
      pagination: {
        page: resolvedPage,
        pageSize: safePageSize,
        total,
        totalPages,
        hasPrev: resolvedPage > 1,
        hasNext: totalPages > 0 && resolvedPage < totalPages
      },
      filters: {
        storeId: normalizedStoreId || '',
        ownerId: normalizedOwnerId || '',
        status: normalizedStatus || '',
        keyword: normalizedKeyword || '',
        createdDate: normalizedCreatedDate || '',
        sortBy: finalOptions.sortBy,
        sortOrder: normalizedSortOrder.toLowerCase()
      },
      summary
    }
  };
}

// 특정 가게 조회 (최적화: JOIN으로 owners 한번에 조회, 캐싱 적용)
async function getStoreById(storeId) {
  // 캐시 확인
  const cacheKey = getCacheKey('store', storeId);
  const cached = getCached(cacheKey);
  if (cached) {
    return cached;
  }
  
  // stores와 owners만 조회 (delivery는 필요할 때만 별도 조회로 성능 최적화)
  const result = await db.query(`
    SELECT 
      s.id, s.name, s.subtitle, s.phone, s.address, s.status, s.subdomain,
      s.subdomain_status, s.subdomain_created_at, s.subdomain_last_modified,
      s."order", s.created_at, s.last_modified, s.paused_at,
      COALESCE(
        json_agg(
          json_build_object(
            'id', o.id,
            'ownerName', o.owner_name,
            'email', o.email,
            'phone', o.phone,
            'status', o.status,
            'approvedAt', o.approved_at,
            'lastLogin', o.last_login,
            'role', COALESCE(sol.role, 'manager'),
            'isPrimary', CASE WHEN o.store_id = sol.store_id THEN TRUE ELSE FALSE END,
            'linkedAt', sol.created_at
          )
          ORDER BY o.owner_name ASC NULLS LAST, o.email ASC
        ) FILTER (WHERE o.id IS NOT NULL),
        '[]'::json
      ) AS owners
    FROM stores s
    LEFT JOIN store_owner_links sol ON sol.store_id = s.id
    LEFT JOIN store_owners o ON sol.owner_id = o.id
    WHERE s.id = $1
    GROUP BY s.id, s.name, s.subtitle, s.phone, s.address, s.status, s.subdomain,
             s.subdomain_status, s.subdomain_created_at, s.subdomain_last_modified,
             s."order", s.created_at, s.last_modified, s.paused_at
  `, [storeId]);
  
  if (result.rows.length === 0) {
    return null;
  }
  
  const row = result.rows[0];
  const owners = row.owners || [];
  return {
    id: row.id,
    name: row.name, // 기존 호환성을 위해 추가
    subtitle: row.subtitle, // 기존 호환성을 위해 추가
    phone: row.phone, // 기존 호환성을 위해 추가
    address: row.address, // 기존 호환성을 위해 추가
    subdomain: row.subdomain, // 서브도메인 추가
    subdomainStatus: row.subdomain_status,
    subdomainCreatedAt: row.subdomain_created_at,
    subdomainLastModified: row.subdomain_last_modified,
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
    owners
  };
}

// 가게 설정 조회
async function getStoreSettings(storeId) {
  const result = await db.query(`
    SELECT basic, discount, delivery, pickup, images, business_hours, section_order, qr_code, seo_settings, ab_test_settings
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
    sectionOrder: settings.section_order || [],
    qrCode: settings.qr_code || {},
    domainSettings: {},
    seoSettings: settings.seo_settings || {},
    abTestSettings: settings.ab_test_settings || {}
  };
}

// 가게 설정 조회 최적화 버전 (stores와 store_settings를 하나의 쿼리로 조회, 캐싱 적용)
// fields 파라미터로 필요한 컬럼만 선택적으로 조회하여 성능 최적화
// 기본값: fields가 없으면 최소 필드만 조회 (성능 최적화)
async function getStoreSettingsOptimized(storeId, fields = null) {
  // fields가 명시적으로 null이거나 빈 배열이면 기본 필드만 조회 (성능 최적화)
  // '*'를 명시적으로 요청한 경우에만 전체 필드 조회
  const includeAll = fields === '*' || (Array.isArray(fields) && fields.length > 0 && fields.includes('*'));
  
  // 캐시 키 생성 (fields 조합별로 별도 캐시)
  // 기본값과 전체 조회는 별도 캐시로 분리하여 캐시 히트율 향상
  const fieldsKey = includeAll 
    ? 'all' 
    : (fields && fields.length > 0 ? fields.sort().join(',') : 'minimal');
  const cacheKey = getCacheKey('storeSettings', `${storeId}_${fieldsKey}`);
  const cached = getCached(cacheKey);
  if (cached) {
    return cached;
  }
  
  // fields 파라미터가 있으면 해당 필드만 SELECT (성능 최적화)
  const selectFields = [];
  
  // 기본 정보는 항상 포함
  selectFields.push('s.id', 's.name', 's.subtitle', 's.phone', 's.address', 's.created_at', 's.last_modified');
  
  if (includeAll) {
    // 모든 설정 필드 포함
    selectFields.push(
      'ss.basic',
      'ss.discount',
      'ss.delivery',
      'ss.pickup',
      'ss.images',
      'ss.business_hours',
      'ss.section_order',
      'ss.qr_code',
      'ss.seo_settings',
      'ss.ab_test_settings'
    );
  } else if (fields && fields.length > 0) {
    // 요청된 필드만 포함 (성능 최적화)
    const fieldsSet = new Set(fields.map(f => f.trim()));
    
    if (fieldsSet.has('basic')) {
      selectFields.push('ss.basic');
    }
    if (fieldsSet.has('discount')) {
      selectFields.push('ss.discount');
    }
    if (fieldsSet.has('delivery')) {
      selectFields.push('ss.delivery');
    }
    if (fieldsSet.has('pickup')) {
      selectFields.push('ss.pickup');
    }
    if (fieldsSet.has('images')) {
      selectFields.push('ss.images');
    }
    if (fieldsSet.has('businessHours') || fieldsSet.has('business_hours')) {
      selectFields.push('ss.business_hours');
    }
    if (fieldsSet.has('sectionOrder') || fieldsSet.has('section_order')) {
      selectFields.push('ss.section_order');
    }
    if (fieldsSet.has('qrCode') || fieldsSet.has('qr_code')) {
      selectFields.push('ss.qr_code');
    }
    if (fieldsSet.has('seoSettings') || fieldsSet.has('seo_settings')) {
      selectFields.push('ss.seo_settings');
    }
    if (fieldsSet.has('abTestSettings') || fieldsSet.has('ab_test_settings')) {
      selectFields.push('ss.ab_test_settings');
    }
  }
  // fields가 없거나 빈 배열이면 설정 필드는 조회하지 않음 (최소 필드만 조회)
  
  // 설정 필드가 필요한 경우에만 JOIN (성능 최적화)
  const needsSettings = selectFields.some(field => field.startsWith('ss.'));
  
  const result = await db.query(`
    SELECT 
      ${selectFields.join(',\n      ')}
    FROM stores s
    ${needsSettings ? 'LEFT JOIN store_settings ss ON s.id = ss.store_id' : ''}
    WHERE s.id = $1
  `, [storeId]);
  
  if (result.rows.length === 0) {
    return null;
  }
  
  const row = result.rows[0];
  const settings = {};
  
  // 조회된 필드만 포함 (성능 최적화: 불필요한 데이터 제외)
  const fieldsSet = fields && fields.length > 0 ? new Set(fields.map(f => f.trim())) : null;
  
  if (includeAll) {
    // 모든 필드 포함
    settings.basic = row.basic || {};
    settings.discount = row.discount || {};
    settings.delivery = row.delivery || {};
    settings.pickup = row.pickup || {};
    settings.images = row.images || {};
    settings.businessHours = row.business_hours || {};
    settings.sectionOrder = row.section_order || [];
    settings.qrCode = row.qr_code || {};
    settings.seoSettings = row.seo_settings || {};
    settings.abTestSettings = row.ab_test_settings || {};
  } else if (fieldsSet && fieldsSet.size > 0) {
    // 요청된 필드만 포함
    if (fieldsSet.has('basic')) {
      settings.basic = row.basic || {};
    }
    if (fieldsSet.has('discount')) {
      settings.discount = row.discount || {};
    }
    if (fieldsSet.has('delivery')) {
      settings.delivery = row.delivery || {};
    }
    if (fieldsSet.has('pickup')) {
      settings.pickup = row.pickup || {};
    }
    if (fieldsSet.has('images')) {
      settings.images = row.images || {};
    }
    if (fieldsSet.has('businessHours') || fieldsSet.has('business_hours')) {
      settings.businessHours = row.business_hours || {};
    }
    if (fieldsSet.has('sectionOrder') || fieldsSet.has('section_order')) {
      settings.sectionOrder = row.section_order || [];
    }
    if (fieldsSet.has('qrCode') || fieldsSet.has('qr_code')) {
      settings.qrCode = row.qr_code || {};
    }
    if (fieldsSet.has('seoSettings') || fieldsSet.has('seo_settings')) {
      settings.seoSettings = row.seo_settings || {};
    }
    if (fieldsSet.has('abTestSettings') || fieldsSet.has('ab_test_settings')) {
      settings.abTestSettings = row.ab_test_settings || {};
    }
  }
  // fields가 없거나 빈 배열이면 settings는 빈 객체 유지 (최소 필드만 조회)
  
  const storeData = {
    id: row.id,
    name: row.name,
    subtitle: row.subtitle,
    phone: row.phone,
    address: row.address,
    createdAt: row.created_at,
    updatedAt: row.last_modified,
    settings
  };
  
  // 캐시에 저장
  setCache(cacheKey, storeData);
  
  return storeData;
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
  const normalizedPhoneDisplay = normalizePhoneNumber(phone);
  if (!normalizedPhoneDisplay || !PHONE_DISPLAY_PATTERN.test(normalizedPhoneDisplay)) {
    return {
      success: false,
      error: '연락처 형식이 올바르지 않습니다. 예: 010-1234-5678'
    };
  }

  const requestInfo = (requestData && typeof requestData === 'object') ? requestData : {};
  const storeName = sanitizeAddressSegment(requestInfo.storeName || requestInfo.name || '');
  const storePostalCode = sanitizeAddressSegment(requestInfo.storePostalCode || requestInfo.postalCode || '');
  const storeRoadAddress = sanitizeAddressSegment(requestInfo.storeRoadAddress || requestInfo.roadAddress || '');
  const storeExtraAddress = sanitizeAddressSegment(requestInfo.storeExtraAddress || requestInfo.extraAddress || '');
  const storeAddressDetail = sanitizeAddressSegment(requestInfo.storeAddressDetail || requestInfo.addressDetail || '');

  if (!storeName) {
    return {
      success: false,
      error: '가게 이름을 입력해주세요.'
    };
  }

  if (!storeRoadAddress) {
    return {
      success: false,
      error: '가게 도로명 주소를 입력해주세요.'
    };
  }

  if (!ADDRESS_ALLOWED_PATTERN.test(storeRoadAddress)) {
    return {
      success: false,
      error: '도로명 주소에 허용되지 않는 문자가 포함되어 있습니다.'
    };
  }

  if (!storeAddressDetail) {
    return {
      success: false,
      error: '상세 주소를 입력해주세요.'
    };
  }

  if (!ADDRESS_ALLOWED_PATTERN.test(storeAddressDetail)) {
    return {
      success: false,
      error: '상세 주소에 허용되지 않는 문자가 포함되어 있습니다.'
    };
  }

  if (storeExtraAddress && !ADDRESS_ALLOWED_PATTERN.test(storeExtraAddress.replace(/^\(|\)$/g, ''))) {
    return {
      success: false,
      error: '참고 항목에 허용되지 않는 문자가 포함되어 있습니다.'
    };
  }

  const fullAddressSegments = [storeRoadAddress];
  if (storeExtraAddress) {
    fullAddressSegments.push(storeExtraAddress);
  }
  if (storeAddressDetail) {
    fullAddressSegments.push(storeAddressDetail);
  }

  const sanitizedRequestData = {
    storeName,
    storePostalCode,
    storeRoadAddress,
    storeExtraAddress,
    storeAddressDetail,
    storeAddress: fullAddressSegments.filter(Boolean).join(' ').trim()
  };

  const normalizedStoreName = storeName.toLowerCase();
  const sanitizedPhone = normalizedPhoneDisplay.replace(/[^0-9]/g, '');

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
      normalizedPhoneDisplay,
      passwordHash,
      typeof message === 'string' ? message.trim() : '',
      JSON.stringify(sanitizedRequestData)
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

  // 재발 방지: 쿼리 실행 전 로그
  console.log('[DB] getOwnerAccounts 호출:', { status, whereClause, params });

  const result = await db.query(
    `SELECT 
        o.id,
        o.store_id AS primary_store_id,
        o.owner_name,
        o.email,
        o.phone,
        o.status,
        o.request_message,
        o.request_data,
        o.created_at,
        o.approved_at,
        o.last_login,
        ps.name AS primary_store_name,
        ps.status AS primary_store_status,
        sol.store_id AS linked_store_id,
        sol.role AS link_role,
        sol.created_at AS link_created_at,
        ls.name AS linked_store_name,
        ls.status AS linked_store_status
     FROM store_owners o
     LEFT JOIN stores ps ON o.store_id = ps.id
     LEFT JOIN store_owner_links sol ON sol.owner_id = o.id
     LEFT JOIN stores ls ON sol.store_id = ls.id
     ${whereClause}
     ORDER BY o.created_at DESC, ls.name ASC NULLS LAST`,
    params
  );

  // 재발 방지: 쿼리 결과 로그
  const uniqueStatuses = [...new Set(result.rows.map(r => r.status))];
  console.log('[DB] getOwnerAccounts 결과:', {
    status,
    statusType: typeof status,
    rowCount: result.rows.length,
    statuses: uniqueStatuses,
    statusCounts: result.rows.reduce((acc, r) => {
      const s = r.status || 'null';
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {}),
    sampleRows: result.rows.slice(0, 5).map(r => ({
      id: r.id,
      email: r.email,
      status: r.status,
      statusType: typeof r.status,
      statusLength: r.status ? r.status.length : 0
    })),
    // 재발 방지: 요청한 status와 실제 결과 비교
    statusMatch: status ? {
      requested: status,
      requestedType: typeof status,
      foundStatuses: uniqueStatuses,
      exactMatch: uniqueStatuses.includes(status),
      caseInsensitiveMatch: uniqueStatuses.some(s => (s || '').toString().trim().toLowerCase() === (status || '').toString().trim().toLowerCase())
    } : null
  });

  const ownersMap = new Map();

  for (const row of result.rows) {
    let owner = ownersMap.get(row.id);
    if (!owner) {
      let requestData = row.request_data || {};
      if (typeof requestData === 'string') {
        try {
          requestData = JSON.parse(requestData);
        } catch (error) {
          requestData = {};
        }
      }

      owner = {
        id: row.id,
        storeId: row.primary_store_id,
        storeName: row.primary_store_name,
        ownerName: row.owner_name,
        email: row.email,
        phone: row.phone,
        status: row.status,
        requestMessage: row.request_message,
        requestData,
        createdAt: row.created_at,
        approvedAt: row.approved_at,
        lastLogin: row.last_login,
        stores: [],
        _storeMap: new Map()
      };

      ownersMap.set(row.id, owner);
    }

    const addStore = (storeId, storeName, storeStatus, role, linkedAt, isPrimary = false) => {
      if (!storeId) return;
      if (owner._storeMap.has(storeId)) {
        const existing = owner._storeMap.get(storeId);
        if (isPrimary) {
          existing.isPrimary = true;
          existing.role = existing.role === 'manager' ? 'primary' : existing.role;
        }
        if (role && role !== existing.role) {
          existing.role = role;
        }
        return;
      }

      owner._storeMap.set(storeId, {
        id: storeId,
        name: storeName || null,
        status: storeStatus || null,
        role: role || (isPrimary ? 'primary' : 'manager'),
        isPrimary,
        linkedAt
      });
    };

    addStore(
      row.primary_store_id,
      row.primary_store_name,
      row.primary_store_status,
      'primary',
      row.link_created_at,
      true
    );

    addStore(
      row.linked_store_id,
      row.linked_store_name,
      row.linked_store_status,
      row.link_role,
      row.link_created_at,
      row.primary_store_id && row.primary_store_id === row.linked_store_id
    );
  }

  const finalOwners = Array.from(ownersMap.values()).map(owner => {
    owner.stores = Array.from(owner._storeMap.values());
    delete owner._storeMap;
    return owner;
  });

  // 재발 방지: 최종 반환 데이터 검증 로그
  console.log('[DB] getOwnerAccounts 최종 반환:', {
    status,
    finalCount: finalOwners.length,
    finalStatuses: finalOwners.map(o => o.status),
    finalOwnerIds: finalOwners.map(o => o.id),
    finalOwnerEmails: finalOwners.map(o => o.email)
  });

  return finalOwners;
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

  const stores = await getStoresByOwner(row.id);

  return {
    id: row.id,
    storeId: row.store_id,
    ownerName: row.owner_name,
    email: row.email,
    phone: row.phone,
    status: row.status,
    requestMessage: row.request_message,
    requestData,
    passwordHash: row.password_hash,
    stores
  };
}

// 가게 사장님 계정 승인
async function approveOwnerAccount(ownerId, { storeId, passwordHash }) {
  // 트랜잭션으로 모든 작업을 원자적으로 처리
  return await db.transaction(async (client) => {
    // 점주 계정 승인
    const result = await client.query(
      `UPDATE store_owners
          SET status = 'active',
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

    // 가게가 있으면 가게 상태 업데이트 및 연결
    if (storeId) {
      await client.query(
        `UPDATE stores
            SET status = 'active', last_modified = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [storeId]
      );
      
      // 점주-가게 연결 (트랜잭션 내에서 실행)
      const linkResult = await client.query(
        `INSERT INTO store_owner_links (store_id, owner_id, role, created_at)
         VALUES ($1, $2, 'owner', CURRENT_TIMESTAMP)
         ON CONFLICT (store_id, owner_id) DO UPDATE
         SET role = EXCLUDED.role,
             created_at = CASE WHEN store_owner_links.created_at IS NULL THEN EXCLUDED.created_at ELSE store_owner_links.created_at END
         RETURNING store_id, owner_id, role, created_at`,
        [storeId, ownerId]
      );
    }

    const owner = result.rows[0];
    // 트랜잭션 내에서 가게 목록 조회
    if (storeId) {
      const storesResult = await client.query(
        `SELECT s.id, s.name, s.address, s.status
         FROM stores s
         JOIN store_owner_links sol ON s.id = sol.store_id
         WHERE sol.owner_id = $1`,
        [ownerId]
      );
      owner.stores = storesResult.rows;
      
      // 가게 정보 캐시 무효화 (트랜잭션 완료 후)
      const storeCacheKey = getCacheKey('store', storeId);
      const settingsCacheKey = getCacheKey('storeSettings', storeId);
      cache.delete(storeCacheKey);
      cache.delete(settingsCacheKey);
    } else {
      owner.stores = [];
    }
    
    return owner;
  });
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
        SET status = 'suspended'
      WHERE id = $1
      RETURNING id, owner_name, email, phone, store_id, status, approved_at`,
    [ownerId]
  );

  if (result.rows.length === 0) {
    throw new Error('점주 계정을 찾을 수 없습니다.');
  }

  const storeIds = new Set();
  const storeId = result.rows[0].store_id;
  if (storeId) {
    storeIds.add(storeId);
  }

  const linkedStores = await getStoresByOwner(ownerId);
  linkedStores.forEach(store => {
    if (store.id) {
      storeIds.add(store.id);
    }
  });

  for (const id of storeIds) {
    await db.query(
      `UPDATE stores
          SET status = 'paused',
              paused_at = CURRENT_TIMESTAMP,
              last_modified = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [id]
    );
  }

  const owner = result.rows[0];
  owner.stores = linkedStores;
  return owner;
}

async function resumeOwnerAccount(ownerId) {
  const result = await db.query(
    `UPDATE store_owners
        SET status = 'active'
      WHERE id = $1
      RETURNING id, owner_name, email, phone, store_id, status, approved_at`,
    [ownerId]
  );

  if (result.rows.length === 0) {
    throw new Error('점주 계정을 찾을 수 없습니다.');
  }

  const storeIds = new Set();
  const storeId = result.rows[0].store_id;
  if (storeId) {
    storeIds.add(storeId);
  }

  const linkedStores = await getStoresByOwner(ownerId);
  linkedStores.forEach(store => {
    if (store.id) {
      storeIds.add(store.id);
    }
  });

  for (const id of storeIds) {
    await db.query(
      `UPDATE stores
          SET status = 'active',
              paused_at = NULL,
              last_modified = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [id]
    );
  }

  const owner = result.rows[0];
  owner.stores = linkedStores;
  return owner;
}

async function updateOwnerPassword(ownerId, newPassword) {
  if (!ownerId) {
    throw new Error('점주 ID가 필요합니다.');
  }

  const sanitizedPassword = typeof newPassword === 'string' ? newPassword.trim() : '';
  if (!sanitizedPassword) {
    throw new Error('새 비밀번호를 입력해주세요.');
  }
  if (sanitizedPassword.length < 8) {
    throw new Error('비밀번호는 8자 이상 입력해주세요.');
  }

  const hashedPassword = hashPassword(sanitizedPassword);
  if (!hashedPassword) {
    throw new Error('비밀번호를 해시할 수 없습니다.');
  }

  const result = await db.query(
    `UPDATE store_owners
        SET password_hash = $2
      WHERE id = $1
      RETURNING id, owner_name, email, phone, status`,
    [ownerId, hashedPassword]
  );

  if (result.rows.length === 0) {
    throw new Error('점주 계정을 찾을 수 없습니다.');
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

  const linkedStores = await getStoresByOwner(ownerId);
  for (const store of linkedStores) {
    if (store.id) {
      await unlinkOwnerFromStore(ownerId, store.id);
    }
  }

  await db.query(
    `DELETE FROM store_owner_links WHERE owner_id = $1`,
    [ownerId]
  );

  await db.query(
    `DELETE FROM store_owners WHERE id = $1`,
    [ownerId]
  );

  return { success: true, ownerId, stores: linkedStores };
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

  // 두 쿼리를 하나로 통합하여 성능 최적화 (단일 스캔)
  const combinedResult = await db.query(
    `WITH event_data AS (
       SELECT 
         date_trunc('day', created_at) AS day,
         event_type,
         COUNT(*)::int AS count
       FROM store_events
      WHERE ($1::varchar IS NULL OR store_id = $1)
        AND created_at BETWEEN $2 AND $3
      GROUP BY day, event_type
     )
     SELECT 
       day,
       event_type,
       count,
       SUM(count) OVER (PARTITION BY event_type) AS total_count
     FROM event_data
     ORDER BY day ASC, event_type`,
    [storeId, rangeStart, rangeEnd]
  );

  // 결과를 totals와 daily로 분리
  const totals = {};
  const daily = {};
  
  combinedResult.rows.forEach(row => {
    const dayKey = row.day.toISOString().split('T')[0];
    const eventType = row.event_type;
    const count = row.count;
    
    // Daily 집계
    if (!daily[dayKey]) {
      daily[dayKey] = {};
    }
    daily[dayKey][eventType] = count;
    
    // Totals 집계 (중복 제거: 첫 번째 행만 사용)
    if (!totals[eventType]) {
      totals[eventType] = row.total_count;
    }
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
          WHEN status = 'active' THEN 0
          WHEN status = 'pending' THEN 1
          WHEN status = 'rejected' THEN 2
          WHEN status = 'suspended' THEN 3
          ELSE 4
        END,
        created_at DESC
      LIMIT 1`,
    [email]
  );

  if (result.rows.length === 0) {
    return { success: false, error: '등록되지 않은 계정입니다.' };
  }

  const owner = result.rows[0];

  if (owner.status !== 'active') {
    if (owner.status === 'pending') {
      return { success: false, error: '아직 승인되지 않은 계정입니다.' };
    } else if (owner.status === 'suspended') {
      return { success: false, error: '일시 중지된 계정입니다.' };
    } else if (owner.status === 'rejected') {
      return { success: false, error: '거절된 계정입니다.' };
    } else {
      return { success: false, error: '로그인할 수 없는 계정 상태입니다.' };
    }
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

  const stores = await getStoresByOwner(owner.id);
  const primaryStore =
    stores.find(store => store.role === 'primary' || store.isPrimary) ||
    stores[0] ||
    null;

  const resolvedStoreId = primaryStore?.id || owner.store_id || null;

  return {
    success: true,
    owner: {
      id: owner.id,
      name: owner.owner_name,
      email: owner.email,
      phone: owner.phone,
      storeId: resolvedStoreId,
      primaryStoreId: primaryStore?.id || null,
      stores,
      storeCount: stores.length
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

// 가게 설정 업데이트
async function updateStoreSettings(storeId, settings) {
  // 캐시 무효화 (최신 데이터 반영)
  clearCache(`store:${storeId}`);
  clearCache(`storeSettings:${storeId}`);
  
  try {
    await ensureStoreSettingsColumns();
    console.log(`가게 설정 업데이트 시도: ${storeId}`, settings);
    
    // store_settings 테이블에서 해당 가게의 기존 설정을 가져오기
    const existingSettingsQuery = await db.query(
      'SELECT basic, delivery, discount, pickup, images, business_hours, section_order, qr_code, seo_settings, ab_test_settings FROM store_settings WHERE store_id = $1',
      [storeId]
    );
    
    // 기존 설정이 있으면 병합, 없으면 새로 생성
    let finalSettings = {};
    
    if (existingSettingsQuery.rows.length > 0) {
      // 기존 설정과 새 설정 병합 (새 설정이 우선)
      const existing = existingSettingsQuery.rows[0];
      finalSettings = {
        basic: { ...(existing.basic || {}), ...(settings.basic || {}) },
        delivery: { ...(existing.delivery || {}), ...(settings.delivery || {}) },
        discount: { ...(existing.discount || {}), ...(settings.discount || {}) },
        pickup: { ...(existing.pickup || {}), ...(settings.pickup || {}) },
        images: { ...(existing.images || {}), ...(settings.images || {}) },
        businessHours: { ...(existing.business_hours || {}), ...(settings.businessHours || {}) },
        sectionOrder: settings.sectionOrder !== undefined ? settings.sectionOrder : (existing.section_order || []),
        qrCode: { ...(existing.qr_code || {}), ...(settings.qrCode || {}) },
        seoSettings: { ...(existing.seo_settings || {}), ...(settings.seoSettings || {}) },
        abTestSettings: { ...(existing.ab_test_settings || {}), ...(settings.abTestSettings || {}) }
      };
    } else {
      // 기존 설정이 없으면 새 설정 사용
      finalSettings = {
        basic: settings.basic || {},
        delivery: settings.delivery || {},
        discount: settings.discount || {},
        pickup: settings.pickup || {},
        images: settings.images || {},
        businessHours: settings.businessHours || {},
        sectionOrder: settings.sectionOrder || [],
        qrCode: settings.qrCode || {},
        seoSettings: settings.seoSettings || {},
        abTestSettings: settings.abTestSettings || {}
      };
    }
    
    // 기본 정보 업데이트 (stores 테이블)
    if (finalSettings.basic && (finalSettings.basic.storeName || finalSettings.basic.storeSubtitle || finalSettings.basic.storePhone || finalSettings.basic.storeAddress)) {
      await db.query(`
        UPDATE stores 
        SET 
          name = COALESCE($2, name),
          subtitle = COALESCE($3, subtitle),
          phone = COALESCE($4, phone),
          address = COALESCE($5, address),
          last_modified = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [
        storeId,
        finalSettings.basic.storeName || null,
        finalSettings.basic.storeSubtitle || null,
        finalSettings.basic.storePhone || null,
        finalSettings.basic.storeAddress || null
      ]);
    }

    if (existingSettingsQuery.rows.length > 0) {
      // 기존 설정 업데이트 (병합된 설정 사용)
      await db.query(`
        UPDATE store_settings 
        SET 
          basic = $2,
          delivery = $3,
          discount = $4,
          pickup = $5,
          images = $6,
          business_hours = $7,
          section_order = $8,
          qr_code = $9,
          seo_settings = $10,
          ab_test_settings = $11,
          updated_at = CURRENT_TIMESTAMP
        WHERE store_id = $1
      `, [
        storeId,
        JSON.stringify(finalSettings.basic),
        JSON.stringify(finalSettings.delivery),
        JSON.stringify(finalSettings.discount),
        JSON.stringify(finalSettings.pickup),
        JSON.stringify(finalSettings.images),
        JSON.stringify(finalSettings.businessHours),
        JSON.stringify(finalSettings.sectionOrder),
        JSON.stringify(finalSettings.qrCode),
        JSON.stringify(finalSettings.seoSettings),
        JSON.stringify(finalSettings.abTestSettings)
      ]);
    } else {
      // 새 설정 생성 (병합된 설정 사용)
      await db.query(`
        INSERT INTO store_settings (
            store_id, basic, delivery, discount, pickup, images, 
            business_hours, section_order, qr_code,
            seo_settings, ab_test_settings, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [
        storeId,
        JSON.stringify(finalSettings.basic),
        JSON.stringify(finalSettings.delivery),
        JSON.stringify(finalSettings.discount),
        JSON.stringify(finalSettings.pickup),
        JSON.stringify(finalSettings.images),
        JSON.stringify(finalSettings.businessHours),
        JSON.stringify(finalSettings.sectionOrder),
        JSON.stringify(finalSettings.qrCode),
        JSON.stringify(finalSettings.seoSettings),
        JSON.stringify(finalSettings.abTestSettings)
      ]);
    }
    
    console.log(`가게 설정 업데이트 완료: ${storeId}`);
    return { success: true, storeId };
  } catch (error) {
    console.error('가게 설정 업데이트 실패:', error);
    throw error;
  }
}

/**
 * 문자열을 안전하게 정리한다.
 * @param {any} value 원본 값
 * @param {number} maxLength 최대 길이
 * @returns {string}
 */
function sanitizeString(value, maxLength = 255) {
  if (value === null || value === undefined) return '';
  const base = typeof value === 'string' ? value : String(value);
  const trimmed = base.trim();
  if (!maxLength || trimmed.length <= maxLength) {
    return trimmed;
  }
  return trimmed.slice(0, maxLength);
}

/**
 * 문자열 배열을 일정 길이로 정리한다.
 * @param {any} list 원본 배열
 * @param {number} itemLength 항목 최대 길이
 * @param {number} limit 항목 최대 개수
 * @returns {string[]}
 */
function sanitizeStringArray(list, itemLength = 120, limit = 10) {
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .map(item => sanitizeString(item, itemLength))
    .filter(item => item.length > 0)
    .slice(0, limit);
}

/**
 * SEO 설정 데이터를 길이 제한에 맞춰 정리한다.
 * @param {object} raw 원본 SEO 설정
 * @returns {object}
 */
function sanitizeSeoSettingsPayload(raw = {}) {
  const checklist = Array.isArray(raw.checklist)
    ? raw.checklist
        .map(item => ({
          item: sanitizeString(item?.item, 120),
          priority: sanitizeString(item?.priority, 20) || '중간',
          impact: sanitizeString(item?.impact, 160)
        }))
        .filter(item => item.item.length > 0)
    : [];

  return {
    metaTitle: sanitizeString(raw.metaTitle, 60),
    metaDescription: sanitizeString(raw.metaDescription, 150),
    keywords: sanitizeStringArray(raw.keywords, 40, 10),
    tone: sanitizeString(raw.tone, 80),
    audienceFocus: sanitizeString(raw.audienceFocus, 120),
    callToAction: sanitizeString(raw.callToAction, 60),
    recommendedSections: sanitizeStringArray(raw.recommendedSections, 60, 10),
    checklist,
    riskWarnings: sanitizeStringArray(raw.riskWarnings, 160, 10),
    finalAdvice: sanitizeString(raw.finalAdvice, 400)
  };
}

/**
 * A/B 테스트 설정 데이터를 길이 제한에 맞춰 정리한다.
 * @param {object} raw 원본 A/B 설정
 * @returns {object}
 */
function sanitizeAbTestSettingsPayload(raw = {}) {
  const tests = Array.isArray(raw.tests)
    ? raw.tests
        .map(test => {
          const variants = Array.isArray(test?.variants)
            ? test.variants
                .map(variant => ({
                  label: sanitizeString(variant?.label, 20) || '',
                  description: sanitizeString(variant?.description, 160)
                }))
                .filter(variant => variant.description.length > 0)
            : [];

          return {
            name: sanitizeString(test?.name, 120),
            hypothesis: sanitizeString(test?.hypothesis, 200),
            variants,
            primaryMetric: sanitizeString(test?.primaryMetric, 80),
            secondaryMetrics: sanitizeStringArray(test?.secondaryMetrics, 60, 6),
            estimatedDuration: sanitizeString(test?.estimatedDuration, 40)
          };
        })
        .filter(test => test.name.length > 0 && test.variants.length > 0)
    : [];

  const copyVariants = Array.isArray(raw.copyVariants)
    ? raw.copyVariants
        .map(variant => ({
          placement: sanitizeString(variant?.placement, 80),
          ideas: sanitizeStringArray(variant?.ideas, 120, 8)
        }))
        .filter(variant => variant.placement.length > 0 && variant.ideas.length > 0)
    : [];

  return {
    tests,
    copyVariants,
    analysisPlan: {
      evaluationCriteria: sanitizeString(raw.analysisPlan?.evaluationCriteria, 200),
      riskMitigation: sanitizeString(raw.analysisPlan?.riskMitigation, 200)
    },
    guardrails: sanitizeStringArray(raw.guardrails, 160, 8),
    successSignals: sanitizeStringArray(raw.successSignals, 160, 8),
    analysisTips: sanitizeStringArray(raw.analysisTips, 160, 8)
  };
}

async function ensureHistoryTables() {
  if (historyTablesEnsured || !historyTablesAvailable) return;
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS seo_settings_history (
        id SERIAL PRIMARY KEY,
        store_id VARCHAR(255) NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        settings JSONB NOT NULL,
        summary JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (store_id, version)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS ab_test_settings_history (
        id SERIAL PRIMARY KEY,
        store_id VARCHAR(255) NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        settings JSONB NOT NULL,
        summary JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (store_id, version)
      )
    `);

    await db.query(`CREATE INDEX IF NOT EXISTS idx_seo_settings_history_store ON seo_settings_history(store_id, version DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ab_settings_history_store ON ab_test_settings_history(store_id, version DESC)`);

    // 성능 최적화: 주요 쿼리에 인덱스 추가
    try {
      // stores 테이블 인덱스
      await db.query(`CREATE INDEX IF NOT EXISTS idx_stores_status ON stores(status)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_stores_subdomain ON stores(subdomain) WHERE subdomain IS NOT NULL`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_stores_created_at ON stores(created_at DESC)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_stores_name_lower ON stores(LOWER(name))`);
      // 복합 인덱스 추가 (status + created_at 정렬 최적화)
      await db.query(`CREATE INDEX IF NOT EXISTS idx_stores_status_created ON stores(status, created_at DESC)`);
      
      // store_owner_links 테이블 인덱스 (복합 인덱스로 단일 컬럼 인덱스 대체)
      // 복합 인덱스가 (store_id), (store_id, owner_id) 둘 다 커버하므로 단일 인덱스는 제거
      await db.query(`CREATE INDEX IF NOT EXISTS idx_store_owner_links_composite ON store_owner_links(store_id, owner_id)`);
      
      // 중복 인덱스 제거 시도 (없으면 무시)
      try {
        await db.query(`DROP INDEX IF EXISTS idx_store_owner_links_store_id`);
        await db.query(`DROP INDEX IF EXISTS idx_store_owner_links_owner_id`);
        console.log('[DB] 중복 인덱스 제거 완료 (store_owner_links)');
      } catch (e) {
        // 인덱스가 없거나 권한 문제면 무시
      }
      
      // store_owners 테이블 인덱스
      await db.query(`CREATE INDEX IF NOT EXISTS idx_store_owners_status ON store_owners(status)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_store_owners_email ON store_owners(email)`);
      
      // store_settings 테이블 인덱스
      await db.query(`CREATE INDEX IF NOT EXISTS idx_store_settings_store_id ON store_settings(store_id)`);
      
      // activity_logs 테이블 인덱스 (존재하는 경우)
      try {
        await db.query(`CREATE INDEX IF NOT EXISTS idx_activity_logs_store_id ON activity_logs(store_id)`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC)`);
      } catch (e) {
        // activity_logs 테이블이 없을 수 있음
      }
      
      console.log('[DB] 성능 최적화 인덱스 생성 완료');
      
      // 테이블 통계 정보 업데이트 (쿼리 플래너 최적화)
      try {
        await db.query('ANALYZE stores');
        await db.query('ANALYZE store_settings');
        await db.query('ANALYZE store_owner_links');
        await db.query('ANALYZE store_owners');
        console.log('[DB] 테이블 통계 정보 업데이트 완료');
      } catch (analyzeError) {
        console.warn('[DB] ANALYZE 실행 실패 (권한 문제일 수 있음):', analyzeError.message);
      }
    } catch (error) {
      console.warn('[DB] 인덱스 생성 실패 (권한 문제일 수 있음):', error.message);
    }

    historyTablesEnsured = true;
  } catch (error) {
    if (error?.code === '42501') {
      console.warn('히스토리 테이블 준비 실패: 현재 사용자에게 CREATE 권한이 없어 히스토리 기능을 비활성화합니다.');
      historyTablesAvailable = false;
      historyTablesEnsured = true;
      return;
    }
    console.error('히스토리 테이블 준비 실패:', error);
    throw error;
  }
}

/**
 * store_settings 테이블에 SEO/AB 테스트 관련 컬럼을 보장한다.
 * 컬럼이 없다면 추가하고, NULL 값은 빈 객체로 초기화한다.
 */
async function ensureStoreSettingsColumns() {
  if (storeSettingsColumnsEnsured || !storeSettingsColumnsAvailable) {
    return;
  }
  try {
    await db.transaction(async client => {
      await client.query(`
        ALTER TABLE store_settings
        ADD COLUMN IF NOT EXISTS basic JSONB
      `);
      await client.query(`
        ALTER TABLE store_settings
        ADD COLUMN IF NOT EXISTS seo_settings JSONB
      `);
      await client.query(`
        ALTER TABLE store_settings
        ADD COLUMN IF NOT EXISTS ab_test_settings JSONB
      `);
      await client.query(`
        ALTER TABLE store_settings
          ALTER COLUMN basic SET DEFAULT '{}'::jsonb
      `);
      await client.query(`
        ALTER TABLE store_settings
          ALTER COLUMN seo_settings SET DEFAULT '{}'::jsonb
      `);
      await client.query(`
        ALTER TABLE store_settings
          ALTER COLUMN ab_test_settings SET DEFAULT '{}'::jsonb
      `);
      await client.query(`
        UPDATE store_settings
           SET basic = '{}'::jsonb
         WHERE basic IS NULL
      `);
      await client.query(`
        UPDATE store_settings
           SET seo_settings = '{}'::jsonb
         WHERE seo_settings IS NULL
      `);
      await client.query(`
        UPDATE store_settings
           SET ab_test_settings = '{}'::jsonb
         WHERE ab_test_settings IS NULL
      `);
    });
    storeSettingsColumnsEnsured = true;
  } catch (error) {
    if (error?.code === '42501') {
      console.warn('스토어 설정 컬럼 준비 실패: 현재 사용자에게 ALTER 권한이 없어 보강을 건너뜁니다.');
      storeSettingsColumnsAvailable = false;
      storeSettingsColumnsEnsured = true;
      return;
    }
    console.error('스토어 설정 컬럼 준비 실패:', error);
    throw error;
  }
}

async function ensureSingleOwnerConstraint() {
  if (singleOwnerConstraintEnsured) return;
  try {
    await db.query(`ALTER TABLE store_owner_links DROP CONSTRAINT IF EXISTS store_owner_links_unique_owner`);
    await db.query(`ALTER TABLE store_owner_links DROP CONSTRAINT IF EXISTS store_owner_links_unique_store`);
    singleOwnerConstraintEnsured = true;
  } catch (error) {
    console.error('점주-가게 연결 제약 해제 실패:', error);
    throw error;
  }
}

function buildSeoHistorySummary(settings = {}) {
  return {
    metaTitle: sanitizeString(settings.metaTitle, 120),
    keywords: sanitizeStringArray(settings.keywords, 40, 10),
    tone: sanitizeString(settings.tone, 80),
    callToAction: sanitizeString(settings.callToAction, 60)
  };
}

function buildAbHistorySummary(settings = {}) {
  const testCount = Array.isArray(settings.tests) ? settings.tests.length : 0;
  const ideaCount = Array.isArray(settings.copyVariants)
    ? settings.copyVariants.reduce((total, variant) => {
        if (!variant || !Array.isArray(variant.ideas)) return total;
        return total + variant.ideas.length;
      }, 0)
    : 0;

  return {
    testCount,
    ideaCount,
    evaluationCriteria: sanitizeString(settings.analysisPlan?.evaluationCriteria, 200)
  };
}

async function appendSeoSettingsHistory(storeId, rawSettings = {}) {
  if (!storeId || !historyTablesAvailable) return null;
  try {
    await ensureHistoryTables();
    const sanitized = sanitizeSeoSettingsPayload(rawSettings);

    const latest = await db.query(
      `SELECT version, settings, summary, created_at
         FROM seo_settings_history
        WHERE store_id = $1
        ORDER BY version DESC
        LIMIT 1`,
      [storeId]
    );

    if (latest.rows.length) {
      const latestSettings = latest.rows[0].settings || {};
      if (JSON.stringify(latestSettings) === JSON.stringify(sanitized)) {
        return {
          version: latest.rows[0].version,
          settings: latestSettings,
          summary: latest.rows[0].summary || buildSeoHistorySummary(latestSettings),
          createdAt: latest.rows[0].created_at
        };
      }
    }

    const nextVersionResult = await db.query(
      `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
         FROM seo_settings_history
        WHERE store_id = $1`,
      [storeId]
    );
    const nextVersion = nextVersionResult.rows[0]?.next_version || 1;
    const summary = buildSeoHistorySummary(sanitized);

    const inserted = await db.query(
      `INSERT INTO seo_settings_history (store_id, version, settings, summary)
       VALUES ($1, $2, $3, $4)
       RETURNING version, settings, summary, created_at`,
      [storeId, nextVersion, JSON.stringify(sanitized), JSON.stringify(summary)]
    );

    const row = inserted.rows[0];
    return {
      version: row.version,
      settings: row.settings,
      summary: row.summary || summary,
      createdAt: row.created_at
    };
  } catch (error) {
    if (error?.code === '42501' || error?.code === '42P01') {
      console.warn('SEO 히스토리 저장 실패: 권한이 없거나 테이블이 없어 히스토리를 비활성화합니다.');
      historyTablesAvailable = false;
      return null;
    }
    console.error('SEO 히스토리 저장 실패:', error);
    return null;
  }
}

async function getSeoSettingsHistory(storeId, limit = 10) {
  if (!storeId || !historyTablesAvailable) return [];
  try {
    await ensureHistoryTables();
    const cappedLimit = Math.max(1, Math.min(Number(limit) || 10, 50));
    const result = await db.query(
      `SELECT version, settings, summary, created_at
         FROM seo_settings_history
        WHERE store_id = $1
        ORDER BY version DESC
        LIMIT $2`,
      [storeId, cappedLimit]
    );

    return result.rows.map(row => {
      const sanitized = sanitizeSeoSettingsPayload(row.settings || {});
      return {
        version: row.version,
        settings: sanitized,
        summary: row.summary || buildSeoHistorySummary(sanitized),
        createdAt: row.created_at
      };
    });
  } catch (error) {
    if (error?.code === '42501' || error?.code === '42P01') {
      console.warn('SEO 히스토리 조회 실패: 권한이 없거나 테이블이 없어 히스토리를 비활성화합니다.');
      historyTablesAvailable = false;
      return [];
    }
    console.error('SEO 히스토리 조회 실패:', error);
    return [];
  }
}

async function appendAbTestSettingsHistory(storeId, rawSettings = {}) {
  if (!storeId || !historyTablesAvailable) return null;
  try {
    await ensureHistoryTables();
    const sanitized = sanitizeAbTestSettingsPayload(rawSettings);

    const latest = await db.query(
      `SELECT version, settings, summary, created_at
         FROM ab_test_settings_history
        WHERE store_id = $1
        ORDER BY version DESC
        LIMIT 1`,
      [storeId]
    );

    if (latest.rows.length) {
      const latestSettings = latest.rows[0].settings || {};
      if (JSON.stringify(latestSettings) === JSON.stringify(sanitized)) {
        return {
          version: latest.rows[0].version,
          settings: latestSettings,
          summary: latest.rows[0].summary || buildAbHistorySummary(latestSettings),
          createdAt: latest.rows[0].created_at
        };
      }
    }

    const nextVersionResult = await db.query(
      `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
         FROM ab_test_settings_history
        WHERE store_id = $1`,
      [storeId]
    );
    const nextVersion = nextVersionResult.rows[0]?.next_version || 1;
    const summary = buildAbHistorySummary(sanitized);

    const inserted = await db.query(
      `INSERT INTO ab_test_settings_history (store_id, version, settings, summary)
       VALUES ($1, $2, $3, $4)
       RETURNING version, settings, summary, created_at`,
      [storeId, nextVersion, JSON.stringify(sanitized), JSON.stringify(summary)]
    );

    const row = inserted.rows[0];
    return {
      version: row.version,
      settings: row.settings,
      summary: row.summary || summary,
      createdAt: row.created_at
    };
  } catch (error) {
    if (error?.code === '42501' || error?.code === '42P01') {
      console.warn('A/B 히스토리 저장 실패: 권한이 없거나 테이블이 없어 히스토리를 비활성화합니다.');
      historyTablesAvailable = false;
      return null;
    }
    console.error('A/B 히스토리 저장 실패:', error);
    return null;
  }
}

async function getAbTestSettingsHistory(storeId, limit = 10) {
  if (!storeId || !historyTablesAvailable) return [];
  try {
    await ensureHistoryTables();
    const cappedLimit = Math.max(1, Math.min(Number(limit) || 10, 50));
    const result = await db.query(
      `SELECT version, settings, summary, created_at
         FROM ab_test_settings_history
        WHERE store_id = $1
        ORDER BY version DESC
        LIMIT $2`,
      [storeId, cappedLimit]
    );

    return result.rows.map(row => {
      const sanitized = sanitizeAbTestSettingsPayload(row.settings || {});
      return {
        version: row.version,
        settings: sanitized,
        summary: row.summary || buildAbHistorySummary(sanitized),
        createdAt: row.created_at
      };
    });
  } catch (error) {
    if (error?.code === '42501' || error?.code === '42P01') {
      console.warn('A/B 히스토리 조회 실패: 권한이 없거나 테이블이 없어 히스토리를 비활성화합니다.');
      historyTablesAvailable = false;
      return [];
    }
    console.error('A/B 히스토리 조회 실패:', error);
    return [];
  }
}

/**
 * SEO 설정을 저장한다.
 * @param {string} storeId 가게 ID
 * @param {object} seoSettings SEO 설정 값
 * @returns {Promise<object>}
 */
async function saveSeoSettingsForStore(storeId, seoSettings = {}) {
  await ensureStoreSettingsColumns();
  const sanitized = sanitizeSeoSettingsPayload(seoSettings);
  await db.query(`
    INSERT INTO store_settings (store_id, seo_settings, created_at, updated_at)
    VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (store_id) DO UPDATE SET
      seo_settings = EXCLUDED.seo_settings,
      updated_at = CURRENT_TIMESTAMP
  `, [
    storeId,
    JSON.stringify(sanitized)
  ]);
  await appendSeoSettingsHistory(storeId, sanitized);
  return sanitized;
}

/**
 * 저장된 SEO 설정을 조회한다.
 * @param {string} storeId 가게 ID
 * @returns {Promise<object|null>}
 */
async function getSeoSettingsForStore(storeId) {
  await ensureStoreSettingsColumns();
  const result = await db.query(`
    SELECT seo_settings
      FROM store_settings
     WHERE store_id = $1
  `, [storeId]);

  if (result.rows.length === 0 || !result.rows[0].seo_settings) {
    return null;
  }

  return sanitizeSeoSettingsPayload(result.rows[0].seo_settings);
}

/**
 * A/B 테스트 설정을 저장한다.
 * @param {string} storeId 가게 ID
 * @param {object} abSettings A/B 테스트 설정 값
 * @returns {Promise<object>}
 */
async function saveAbTestSettingsForStore(storeId, abSettings = {}) {
  await ensureStoreSettingsColumns();
  const sanitized = sanitizeAbTestSettingsPayload(abSettings);
  await db.query(`
    INSERT INTO store_settings (store_id, ab_test_settings, created_at, updated_at)
    VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (store_id) DO UPDATE SET
      ab_test_settings = EXCLUDED.ab_test_settings,
      updated_at = CURRENT_TIMESTAMP
  `, [
    storeId,
    JSON.stringify(sanitized)
  ]);
  await appendAbTestSettingsHistory(storeId, sanitized);
  return sanitized;
}

/**
 * 저장된 A/B 테스트 설정을 조회한다.
 * @param {string} storeId 가게 ID
 * @returns {Promise<object|null>}
 */
async function getAbTestSettingsForStore(storeId) {
  await ensureStoreSettingsColumns();
  const result = await db.query(`
    SELECT ab_test_settings
      FROM store_settings
     WHERE store_id = $1
  `, [storeId]);

  if (result.rows.length === 0 || !result.rows[0].ab_test_settings) {
    return null;
  }

  return sanitizeAbTestSettingsPayload(result.rows[0].ab_test_settings);
}

// 전체 데이터 조회 (기존 API 호환성) - 최적화됨
async function getAllData() {
  const [superadmin, storesResult, currentStoreId] = await Promise.all([
    getSuperAdmin(),
    getStores({ page: 1, pageSize: 20, includeSummary: false }), // pageSize 500 -> 20으로 대폭 감소
    getCurrentStoreId()
  ]);
  
  const stores = Array.isArray(storesResult?.data)
    ? storesResult.data
    : Array.isArray(storesResult)
      ? storesResult
      : [];
  
  // 설정은 개별 API로 조회하도록 변경 (데이터 전송량 절감)
  // for (const store of stores) {
  //   storesObj[store.id] = store;
  //   settings[store.id] = await getStoreSettings(store.id);
  // }
  
  return {
    superadmin,
    stores, // 배열로 반환 (프론트엔드 호환성)
    currentStoreId,
    settings: {}, // 설정은 개별 API로 조회하도록 변경
    deliveryOrders: {}, // 기존 구조 유지
    images: {} // 기존 구조 유지
  };
}

// 슈퍼어드민 인증
async function authenticateSuperAdmin(username, password) {
  const normalizedUsername = (username || '').trim();
  let admin = null;
  let queriedByUsername = false;

  if (normalizedUsername) {
    const result = await db.query(
      `
        SELECT id, username, password_hash
        FROM superadmin
        WHERE username = $1
      `,
      [normalizedUsername]
    );
    if (result.rows.length > 0) {
      admin = result.rows[0];
      queriedByUsername = true;
    }
  }

  let legacySeeded = false;

  if (!admin) {
    const fallback = await db.query(`
      SELECT id, username, password_hash
      FROM superadmin
      ORDER BY id
      LIMIT 1
    `);
    if (fallback.rows.length > 0) {
      admin = fallback.rows[0];
    } else {
      const legacySuperadmin = getLegacySuperadmin();
      if (!legacySuperadmin) {
        return { success: false, error: '사용자를 찾을 수 없습니다.' };
      }

      const inserted = await db.query(
        `
          INSERT INTO superadmin (username, password_hash, created_at, last_modified)
          VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (username) DO UPDATE
          SET password_hash = EXCLUDED.password_hash,
              last_modified = CURRENT_TIMESTAMP
          RETURNING id, username, password_hash
        `,
        [legacySuperadmin.username, legacySuperadmin.passwordHash]
      );

      admin = inserted.rows[0];
      legacySeeded = true;
    }
  }

  if (!password || !admin.password_hash) {
    return { success: false, error: '비밀번호가 일치하지 않습니다.' };
  }

  const hashPattern = /^[0-9a-f]{64}$/i;
  const hashedInput = hashPassword(password);
  let passwordMatches = false;

  if (hashPattern.test(admin.password_hash)) {
    passwordMatches = admin.password_hash === hashedInput;
  } else {
    passwordMatches = admin.password_hash === password;
    if (passwordMatches) {
      await db.query(
        `UPDATE superadmin
            SET password_hash = $1,
                last_modified = CURRENT_TIMESTAMP
          WHERE id = $2`,
        [hashedInput, admin.id]
      );
    }
  }

  if (!passwordMatches) {
    const legacySuperadmin = getLegacySuperadmin();
    if (legacySuperadmin && legacySuperadmin.passwordHash === hashedInput) {
      const updated = await db.query(
        `UPDATE superadmin
            SET username = $1,
                password_hash = $2,
                last_modified = CURRENT_TIMESTAMP
          WHERE id = $3
          RETURNING username, password_hash`,
        [legacySuperadmin.username, legacySuperadmin.passwordHash, admin.id]
      );
      if (updated.rows.length > 0) {
        admin.username = updated.rows[0].username;
        admin.password_hash = updated.rows[0].password_hash;
        passwordMatches = true;
      }
    }
  }

  if (!passwordMatches) {
    return { success: false, error: '비밀번호가 일치하지 않습니다.' };
  }

  if (!legacySeeded && !queriedByUsername && normalizedUsername && normalizedUsername !== admin.username) {
    await db.query(
      `UPDATE superadmin
          SET username = $1,
              last_modified = CURRENT_TIMESTAMP
        WHERE id = $2`,
      [normalizedUsername, admin.id]
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
    const result = await db.query(`
      SELECT 
        s.id, s.name, s.subtitle, s.phone, s.address, s.status, s.subdomain,
        s.subdomain_status, s.subdomain_created_at, s.subdomain_last_modified,
        s."order", s.created_at, s.last_modified, s.paused_at
      FROM stores s
      WHERE s.subdomain = $1
      LIMIT 1
    `, [subdomain]);
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
    const storeName = (storeData.name || '').trim();
    const storeAddress = (storeData.address || '').trim();
    const storePhone = (storeData.phone || '').trim();
    
    // 중복 체크: 동일한 이름+주소+전화번호 조합이 있는지 확인
    if (storeName && storeAddress) {
      const existingCheck = await db.query(`
        SELECT id, name, address, phone, status
        FROM stores
        WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
          AND LOWER(TRIM(address)) = LOWER(TRIM($2))
          ${storePhone ? `AND TRIM(phone) = TRIM($3)` : 'AND (phone IS NULL OR phone = \'\')'}
        LIMIT 1
      `, storePhone ? [storeName, storeAddress, storePhone] : [storeName, storeAddress]);
      
      if (existingCheck.rows.length > 0) {
        const existing = existingCheck.rows[0];
        // 삭제되지 않은 가게면 에러 (중복 생성 방지)
        if (existing.status !== 'deleted') {
          throw new Error(`동일한 가게가 이미 존재합니다: ${existing.name} (${existing.id})`);
        }
        // 삭제된 가게면 복구
        console.log(`[가게 생성] 삭제된 가게 복구: ${existing.id}`);
        const now = new Date().toISOString();
        const updateResult = await db.query(`
          UPDATE stores
          SET status = $1,
              name = COALESCE(NULLIF($2, ''), name),
              address = COALESCE(NULLIF($3, ''), address),
              phone = COALESCE(NULLIF($4, ''), phone),
              last_modified = $5,
              paused_at = NULL
          WHERE id = $6
          RETURNING *
        `, [
          storeData.status || 'pending',
          storeName || null,
          storeAddress || null,
          storePhone || null,
          now,
          existing.id
        ]);
        
        // 기본 설정이 없으면 생성
        const settingsCheck = await db.query(`SELECT store_id FROM store_settings WHERE store_id = $1`, [existing.id]);
        if (settingsCheck.rows.length === 0) {
          const basicInfo = storeData.basic || {
            storeName: storeName,
            storeSubtitle: storeData.subtitle || '',
            storePhone: storePhone,
            storeAddress: storeAddress
          };
          await db.query(`
            INSERT INTO store_settings (store_id, basic, discount, delivery, pickup, images, business_hours, section_order, qr_code)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [
            existing.id,
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
        }
        
        return await getStoreById(existing.id);
      }
    }
    
    const storeId = `store_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    const status = storeData.status || 'active';
    const basicInfo = storeData.basic || {
      storeName: storeName,
      storeSubtitle: storeData.subtitle || '',
      storePhone: storePhone,
      storeAddress: storeAddress
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
      INSERT INTO store_settings (
        store_id, basic, discount, delivery, pickup, images,
        business_hours, section_order, qr_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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

async function createStoreForOwner(ownerId, storeData = {}, memo = '') {
  if (!ownerId) {
    throw new Error('점주 ID가 필요합니다.');
  }

  const ownerResult = await db.query(
    `SELECT id, owner_name, email, status
       FROM store_owners
      WHERE id = $1
      LIMIT 1`,
    [ownerId]
  );

  if (ownerResult.rows.length === 0) {
    throw new Error('점주 계정을 찾을 수 없습니다.');
  }

  const owner = ownerResult.rows[0];
  if (owner.status !== 'active') {
    throw new Error('승인된 점주 계정만 입점 신청이 가능합니다.');
  }

  const storeRecord = await createStore({
    ...storeData,
    status: storeData.status || 'pending'
  });

  await linkOwnerToStore(ownerId, storeRecord.id, { role: 'primary', makePrimary: true });

  const logId = `log_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const description = `'${owner.owner_name || owner.email || '점주'}' 님이 '${storeRecord.name || '새 가게'}' 입점 신청을 제출했습니다.`;

  try {
    await createActivityLog({
      id: logId,
      logType: 'store',
      action: '가게 입점 신청',
      description,
      user: owner.email || owner.id,
      storeId: storeRecord.id,
      details: {
        ownerId,
        memo: memo || '',
        source: 'owner-dashboard',
        status: 'pending'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('입점 신청 로그 기록 실패:', error);
  }

  return {
    store: storeRecord,
    owner: {
      id: owner.id,
      ownerName: owner.owner_name,
      email: owner.email
    }
  };
}

async function updateStoreSubdomain(storeId, options = {}) {
  try {
    const now = new Date().toISOString();
    const normalizedSubdomain = options.subdomain && options.subdomain.trim() !== ''
      ? options.subdomain.trim()
      : null;
    const nextStatus = options.status
      || (normalizedSubdomain ? 'active' : 'inactive');

    const result = await db.query(`
      UPDATE stores
         SET subdomain = $2::text,
             subdomain_status = $3::text,
             subdomain_created_at = CASE
               WHEN subdomain_created_at IS NULL AND $2 IS NOT NULL THEN $4::timestamptz
               ELSE subdomain_created_at
             END,
             subdomain_last_modified = CASE
               WHEN $2 IS NOT NULL THEN $4::timestamptz
               ELSE subdomain_last_modified
             END,
             last_modified = $4::timestamptz
       WHERE id = $1
       RETURNING subdomain, subdomain_status, subdomain_created_at, subdomain_last_modified
    `, [storeId, normalizedSubdomain, nextStatus, now]);

    if (result.rows.length === 0) {
      throw new Error('가게를 찾을 수 없습니다.');
    }

    return result.rows[0];
  } catch (error) {
    if (error?.code === '23505') {
      const conflictError = new Error('이미 사용 중인 서브도메인입니다.');
      conflictError.isSubdomainConflict = true;
      throw conflictError;
    }
    console.error('서브도메인 업데이트 실패:', error);
    throw error;
  }
}

// 가게 수정
async function updateStore(storeId, storeData) {
  // 가게 업데이트 시 캐시 무효화
  clearCache(`store:${storeId}`);
  clearCache(`storeSettings:${storeId}`);
  
  try {
    const now = new Date().toISOString();

    const result = await db.query(`
      UPDATE stores 
      SET name = $2, subtitle = $3, phone = $4, address = $5, last_modified = $6
      WHERE id = $1
      RETURNING *
    `, [
      storeId,
      storeData.name || '',
      storeData.subtitle || '',
      storeData.phone || '',
      storeData.address || '',
      now
    ]);

    if (result.rows.length === 0) {
      throw new Error('가게를 찾을 수 없습니다.');
    }

    // 서브도메인 관련 입력이 존재하면 전용 로직으로 상태와 타임스탬프를 동기화한다.
    if (Object.prototype.hasOwnProperty.call(storeData, 'subdomain') || Object.prototype.hasOwnProperty.call(storeData, 'subdomainStatus')) {
      const normalizedSubdomain = storeData.subdomain && storeData.subdomain.trim() !== '' ? storeData.subdomain.trim() : null;
      const currentSubdomain = result.rows[0].subdomain;
      const statusProvided = Object.prototype.hasOwnProperty.call(storeData, 'subdomainStatus');

      if (currentSubdomain !== normalizedSubdomain || statusProvided) {
        await updateStoreSubdomain(storeId, {
          subdomain: normalizedSubdomain,
          status: statusProvided ? storeData.subdomainStatus : undefined
        });
      }
    }

    const refreshed = await db.query(
      `SELECT *
         FROM stores
        WHERE id = $1
        LIMIT 1`,
      [storeId]
    );

    return refreshed.rows[0];
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

// 가게 승인
async function approveStore(storeId) {
  try {
    const now = new Date().toISOString();
    const result = await db.query(`
      UPDATE stores
      SET status = 'active',
          paused_at = NULL,
          last_modified = $2
      WHERE id = $1
      RETURNING *
    `, [storeId, now]);

    if (result.rows.length === 0) {
      throw new Error('가게를 찾을 수 없습니다.');
    }

    const store = result.rows[0];
    try {
      await createActivityLog({
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        logType: 'store',
        action: '가게 승인',
        description: `'${store.name || store.id}' 가게 입점 요청이 승인되었습니다.`,
        user: 'system',
        storeId,
        details: {
          status: 'active'
        },
        timestamp: now
      });
    } catch (logError) {
      console.error('가게 승인 로그 기록 실패:', logError);
    }

    return store;
  } catch (error) {
    console.error('가게 승인 실패:', error);
    throw error;
  }
}

// 가게 거절
async function rejectStore(storeId, reason = '') {
  try {
    const now = new Date().toISOString();
    const result = await db.query(`
      UPDATE stores
      SET status = 'rejected',
          paused_at = NULL,
          last_modified = $2
      WHERE id = $1
      RETURNING *
    `, [storeId, now]);

    if (result.rows.length === 0) {
      throw new Error('가게를 찾을 수 없습니다.');
    }

    const store = result.rows[0];
    try {
      await createActivityLog({
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        logType: 'store',
        action: '가게 거절',
        description: `'${store.name || store.id}' 가게 입점 요청이 거절되었습니다.`,
        user: 'system',
        storeId,
        details: {
          status: 'rejected',
          reason: reason || ''
        },
        timestamp: now
      });
    } catch (logError) {
      console.error('가게 거절 로그 기록 실패:', logError);
    }

    return store;
  } catch (error) {
    console.error('가게 거절 실패:', error);
    throw error;
  }
}

function parseJsonColumn(rawValue, fallback) {
  if (!rawValue && rawValue !== 0) {
    return fallback;
  }
  if (typeof rawValue === 'object') {
    return rawValue;
  }
  if (typeof rawValue === 'string') {
    try {
      return JSON.parse(rawValue);
    } catch (error) {
      return fallback;
    }
  }
  return fallback;
}

async function getStoresForExport() {
  const result = await db.query(`
    SELECT 
      s.id,
      s.name,
      s.subtitle,
      s.phone,
      s.address,
      s.status,
      s.subdomain,
      s.created_at,
      s.last_modified,
      ss.basic,
      ss.discount,
      ss.delivery,
      ss.pickup,
      ss.business_hours
    FROM stores s
    LEFT JOIN store_settings ss ON ss.store_id = s.id
    ORDER BY s.created_at DESC
  `);

  return result.rows.map(row => ({
    id: row.id,
    name: row.name || '',
    subtitle: row.subtitle || '',
    phone: row.phone || '',
    address: row.address || '',
    status: row.status || 'pending',
    subdomain: row.subdomain || '',
    createdAt: row.created_at ? row.created_at.toISOString() : null,
    lastModified: row.last_modified ? row.last_modified.toISOString() : null,
    settings: {
      basic: parseJsonColumn(row.basic, {}),
      discount: parseJsonColumn(row.discount, {}),
      delivery: parseJsonColumn(row.delivery, {}),
      pickup: parseJsonColumn(row.pickup, {}),
      businessHours: parseJsonColumn(row.business_hours, {})
    }
  }));
}

async function bulkUpdateStoreStatus(storeIds = [], nextStatus = 'paused') {
  const ids = Array.isArray(storeIds) ? storeIds.map(id => String(id).trim()).filter(Boolean) : [];
  if (!ids.length) {
    return { updatedCount: 0 };
  }
  const now = new Date().toISOString();
  const status = nextStatus === 'active' ? 'active' : 'paused';
  const result = await db.query(
    `UPDATE stores
        SET status = $2,
            paused_at = CASE WHEN $2 = 'paused' THEN $3 ELSE NULL END,
            last_modified = $3
      WHERE id = ANY($1::text[])
      RETURNING id`,
    [ids, status, now]
  );
  return {
    updatedCount: result.rowCount,
    affectedIds: result.rows.map(row => row.id)
  };
}

async function bulkDeleteStores(storeIds = []) {
  const ids = Array.isArray(storeIds) ? storeIds.map(id => String(id).trim()).filter(Boolean) : [];
  if (!ids.length) {
    return { deletedCount: 0 };
  }
  const result = await db.query(
    `DELETE FROM stores
      WHERE id = ANY($1::text[])
      RETURNING id`,
    [ids]
  );
  return {
    deletedCount: result.rowCount,
    deletedIds: result.rows.map(row => row.id)
  };
}

// 이름, 주소, 전화번호로 정확한 가게 찾기 (점주 승인용)
async function findStoreByNameAndAddress(storeName, storeAddress, storePhone = null) {
  if (!storeName || !storeAddress) {
    return null;
  }
  
  try {
    const query = storePhone
      ? `
        SELECT id, name, address, phone, status
        FROM stores
        WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
        AND LOWER(TRIM(address)) = LOWER(TRIM($2))
        AND TRIM(phone) = TRIM($3)
        AND status != 'deleted'
        ORDER BY created_at DESC
        LIMIT 1
      `
      : `
        SELECT id, name, address, phone, status
        FROM stores
        WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
        AND LOWER(TRIM(address)) = LOWER(TRIM($2))
        AND (phone IS NULL OR phone = '' OR TRIM(phone) = '')
        AND status != 'deleted'
        ORDER BY created_at DESC
        LIMIT 1
      `;
    
    const params = storePhone 
      ? [storeName.trim(), storeAddress.trim(), storePhone.trim()]
      : [storeName.trim(), storeAddress.trim()];
    
    const result = await db.query(query, params);
    
    if (result.rows.length > 0) {
      return result.rows[0];
    }
    
    return null;
  } catch (error) {
    console.error('[가게 찾기] 에러:', error);
    throw error;
  }
}

module.exports = {
  getSuperAdmin,
  getStores,
  getStoreById,
  findStoreByNameAndAddress,
  getStoreBySubdomain,
  getStoreSettings,
  getStoreSettingsOptimized,
  updateStoreSettings,
  updateStoreSubdomain,
  getCurrentStoreId,
  setCurrentStoreId,
  getActivityLogs,
  createActivityLog,
  createStore,
  createStoreForOwner,
  updateStore,
  deleteStore,
  pauseStore,
  resumeStore,
  approveStore,
  rejectStore,
  getStoresForExport,
  clearCache, // 캐시 관리 함수 export
  bulkUpdateStoreStatus,
  bulkDeleteStores,
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
  getStoresByOwner,
  getOwnersByStore,
  linkOwnerToStore,
  unlinkOwnerFromStore,
  setPrimaryOwnerForStore,
  getOwnerAccountDetail,
  getSeoSettingsForStore,
  saveSeoSettingsForStore,
  getSeoSettingsHistory,
  appendSeoSettingsHistory,
  getAbTestSettingsForStore,
  saveAbTestSettingsForStore,
  getAbTestSettingsHistory,
  appendAbTestSettingsHistory,
  updateOwnerPassword,
  hashPassword,
  pauseOwnerAccount,
  resumeOwnerAccount,
  deleteOwnerAccount,
  createStoreEvent,
  getEventSummary,
  getEventTotalsByStore
};
