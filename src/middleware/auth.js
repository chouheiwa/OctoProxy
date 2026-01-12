/**
 * 认证中间件
 */

import { validateApiKey } from '../db/api-keys.js';
import { validateSession } from '../db/sessions.js';

/**
 * 从请求中提取 Bearer Token
 * @param {Object} req 请求对象
 * @returns {string|null}
 */
export function extractBearerToken(req) {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (!authHeader) return null;

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
        return null;
    }

    return parts[1];
}

/**
 * 从请求中提取 API Key（支持多种格式）
 * @param {Object} req 请求对象
 * @returns {string|null}
 */
export function extractApiKey(req) {
    // 1. 从 Authorization header 提取
    const bearerToken = extractBearerToken(req);
    if (bearerToken) return bearerToken;

    // 2. 从 x-api-key header 提取
    const xApiKey = req.headers['x-api-key'];
    if (xApiKey) return xApiKey;

    return null;
}

/**
 * API Key 认证中间件
 * @param {Object} req 请求对象
 * @param {Object} res 响应对象
 * @returns {{ success: boolean, apiKey?: Object, error?: string }}
 */
export function authenticateApiKey(req, res) {
    const key = extractApiKey(req);

    if (!key) {
        return {
            success: false,
            error: 'Missing API key. Please provide an API key via Authorization header or x-api-key header.'
        };
    }

    const apiKey = validateApiKey(key);

    if (!apiKey) {
        return {
            success: false,
            error: 'Invalid API key.'
        };
    }

    if (apiKey.exceeded) {
        return {
            success: false,
            error: 'API key daily limit exceeded.'
        };
    }

    return {
        success: true,
        apiKey
    };
}

/**
 * 从 Cookie 中提取 Session Token
 * @param {Object} req 请求对象
 * @returns {string|null}
 */
export function extractSessionToken(req) {
    const cookieHeader = req.headers['cookie'];
    if (!cookieHeader) return null;

    const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        acc[key] = value;
        return acc;
    }, {});

    return cookies['session_token'] || null;
}

/**
 * Session 认证中间件（用于管理 API）
 * @param {Object} req 请求对象
 * @param {Object} res 响应对象
 * @returns {{ success: boolean, session?: Object, error?: string }}
 */
export function authenticateSession(req, res) {
    // 优先从 Authorization header 提取
    let token = extractBearerToken(req);

    // 其次从 Cookie 提取
    if (!token) {
        token = extractSessionToken(req);
    }

    if (!token) {
        return {
            success: false,
            error: 'Authentication required. Please login first.'
        };
    }

    const session = validateSession(token);

    if (!session) {
        return {
            success: false,
            error: 'Invalid or expired session. Please login again.'
        };
    }

    return {
        success: true,
        session
    };
}

/**
 * 检查是否为管理员
 * @param {Object} session 会话对象
 * @returns {boolean}
 */
export function isAdmin(session) {
    return session && session.role === 'admin';
}

/**
 * 管理员认证中间件
 * @param {Object} req 请求对象
 * @param {Object} res 响应对象
 * @returns {{ success: boolean, session?: Object, error?: string }}
 */
export function authenticateAdmin(req, res) {
    const result = authenticateSession(req, res);

    if (!result.success) {
        return result;
    }

    if (!isAdmin(result.session)) {
        return {
            success: false,
            error: 'Admin privileges required.'
        };
    }

    return result;
}

export default {
    extractBearerToken,
    extractApiKey,
    authenticateApiKey,
    extractSessionToken,
    authenticateSession,
    isAdmin,
    authenticateAdmin
};
