"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setAuctionEnd = setAuctionEnd;
exports.getAuctionEnd = getAuctionEnd;
exports.clearAuctionEnd = clearAuctionEnd;
exports.getAllActiveAuctionIds = getAllActiveAuctionIds;
exports.getExpiredAuctionIds = getExpiredAuctionIds;
exports.pingRedis = pingRedis;
var ioredis_1 = __importDefault(require("ioredis"));
var EXPIRE_KEY = "auctions:expiring";
/**
 * In-memory fallback — fine for a single-instance deployment with 10–20 users.
 * If this service is ever scaled to multiple instances, or Redis is added back later,
 * switch back to the Redis-backed implementation by setting REDIS_URL.
 */
var memoryExpiry = new Map();
var redis = null;
function useRedis() {
    return Boolean(process.env.REDIS_URL);
}
function getRedis() {
    if (!redis) {
        redis = new ioredis_1.default(process.env.REDIS_URL, {
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
            lazyConnect: true,
        });
    }
    return redis;
}
function setAuctionEnd(auctionId, endsAt) {
    return __awaiter(this, void 0, void 0, function () {
        var ms;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    ms = endsAt.getTime();
                    if (!useRedis()) return [3 /*break*/, 2];
                    return [4 /*yield*/, getRedis().zadd(EXPIRE_KEY, ms, auctionId)];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
                case 2:
                    memoryExpiry.set(auctionId, ms);
                    return [2 /*return*/];
            }
        });
    });
}
function getAuctionEnd(auctionId) {
    return __awaiter(this, void 0, void 0, function () {
        var score, ms;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!useRedis()) return [3 /*break*/, 2];
                    return [4 /*yield*/, getRedis().zscore(EXPIRE_KEY, auctionId)];
                case 1:
                    score = _a.sent();
                    if (score === null)
                        return [2 /*return*/, null];
                    return [2 /*return*/, new Date(Number(score))];
                case 2:
                    ms = memoryExpiry.get(auctionId);
                    return [2 /*return*/, ms !== undefined ? new Date(ms) : null];
            }
        });
    });
}
function clearAuctionEnd(auctionId) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!useRedis()) return [3 /*break*/, 2];
                    return [4 /*yield*/, getRedis().zrem(EXPIRE_KEY, auctionId)];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
                case 2:
                    memoryExpiry.delete(auctionId);
                    return [2 /*return*/];
            }
        });
    });
}
/** Auction IDs whose timer has not yet elapsed. */
function getAllActiveAuctionIds() {
    return __awaiter(this, arguments, void 0, function (now) {
        var ids, _i, _a, _b, id, endsAt;
        if (now === void 0) { now = Date.now(); }
        return __generator(this, function (_c) {
            if (useRedis()) {
                return [2 /*return*/, getRedis().zrangebyscore(EXPIRE_KEY, now + 1, "+inf")];
            }
            ids = [];
            for (_i = 0, _a = memoryExpiry.entries(); _i < _a.length; _i++) {
                _b = _a[_i], id = _b[0], endsAt = _b[1];
                if (endsAt > now)
                    ids.push(id);
            }
            return [2 /*return*/, ids];
        });
    });
}
/** Auction IDs whose timer has elapsed (used by the background closer worker). */
function getExpiredAuctionIds() {
    return __awaiter(this, arguments, void 0, function (now) {
        var expired, _i, _a, _b, id, endsAt;
        if (now === void 0) { now = Date.now(); }
        return __generator(this, function (_c) {
            if (useRedis()) {
                return [2 /*return*/, getRedis().zrangebyscore(EXPIRE_KEY, 0, now)];
            }
            expired = [];
            for (_i = 0, _a = memoryExpiry.entries(); _i < _a.length; _i++) {
                _b = _a[_i], id = _b[0], endsAt = _b[1];
                if (endsAt <= now)
                    expired.push(id);
            }
            return [2 /*return*/, expired];
        });
    });
}
/** Ping Redis when configured — used by /health. */
function pingRedis() {
    return __awaiter(this, void 0, void 0, function () {
        var client, pong, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!useRedis())
                        return [2 /*return*/, false];
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 5, , 6]);
                    client = getRedis();
                    if (!(client.status !== "ready")) return [3 /*break*/, 3];
                    return [4 /*yield*/, client.connect()];
                case 2:
                    _b.sent();
                    _b.label = 3;
                case 3: return [4 /*yield*/, client.ping()];
                case 4:
                    pong = _b.sent();
                    return [2 /*return*/, pong === "PONG"];
                case 5:
                    _a = _b.sent();
                    return [2 /*return*/, false];
                case 6: return [2 /*return*/];
            }
        });
    });
}
