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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCommittedBudget = getCommittedBudget;
exports.getSquadCount = getSquadCount;
exports.getAvailableBudget = getAvailableBudget;
exports.canUserBid = canUserBid;
exports.canUserWinAuction = canUserWinAuction;
var prisma_1 = require("@/lib/prisma");
var constants_1 = require("./constants");
/** Sum of amounts where user is current highest bidder on active auctions */
function getCommittedBudget(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var activeBids;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, prisma_1.prisma.auction.findMany({
                        where: {
                            status: "active",
                            currentBidderId: userId,
                        },
                        select: { currentBid: true },
                    })];
                case 1:
                    activeBids = _a.sent();
                    return [2 /*return*/, activeBids.reduce(function (sum, a) { return sum + a.currentBid; }, 0)];
            }
        });
    });
}
function getSquadCount(userId) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, prisma_1.prisma.squadPlayer.count({ where: { userId: userId } })];
        });
    });
}
function getAvailableBudget(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var user, committed;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, prisma_1.prisma.user.findUnique({
                        where: { id: userId },
                        select: { budget: true },
                    })];
                case 1:
                    user = _a.sent();
                    if (!user)
                        return [2 /*return*/, 0];
                    return [4 /*yield*/, getCommittedBudget(userId)];
                case 2:
                    committed = _a.sent();
                    return [2 /*return*/, user.budget - committed];
            }
        });
    });
}
function canUserBid(userId, amount, opts) {
    return __awaiter(this, void 0, void 0, function () {
        var available, allowance, squadCount, limit;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, getAvailableBudget(userId)];
                case 1:
                    available = _c.sent();
                    allowance = (_a = opts === null || opts === void 0 ? void 0 : opts.overdraftAllowance) !== null && _a !== void 0 ? _a : 0;
                    if (amount > available + allowance) {
                        return [2 /*return*/, {
                                ok: false,
                                reason: "Budget exceeded. Available: ".concat(available.toLocaleString()),
                            }];
                    }
                    return [4 /*yield*/, getSquadCount(userId)];
                case 2:
                    squadCount = _c.sent();
                    limit = (_b = opts === null || opts === void 0 ? void 0 : opts.squadLimit) !== null && _b !== void 0 ? _b : constants_1.SQUAD_LIMIT;
                    if (squadCount >= limit) {
                        return [2 /*return*/, { ok: false, reason: "Squad full (".concat(squadCount, "/").concat(limit, ")") }];
                    }
                    return [2 /*return*/, { ok: true }];
            }
        });
    });
}
function canUserWinAuction(userId_1) {
    return __awaiter(this, arguments, void 0, function (userId, squadLimit) {
        var squadCount;
        if (squadLimit === void 0) { squadLimit = constants_1.SQUAD_LIMIT; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getSquadCount(userId)];
                case 1:
                    squadCount = _a.sent();
                    if (squadCount >= squadLimit) {
                        return [2 /*return*/, { ok: false, reason: "Squad full" }];
                    }
                    return [2 /*return*/, { ok: true }];
            }
        });
    });
}
