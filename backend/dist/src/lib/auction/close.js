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
exports.getBidTimerSeconds = getBidTimerSeconds;
exports.isMarketLocked = isMarketLocked;
exports.closeAuction = closeAuction;
var prisma_1 = require("@/lib/prisma");
var timerStore_1 = require("@/lib/timerStore");
var budget_1 = require("./budget");
function getBidTimerSeconds(settings, now) {
    var _a, _b;
    if (now === void 0) { now = new Date(); }
    if (!settings)
        return 60;
    var deadlineEnd = (_b = (_a = settings.deadlineEndsAt) !== null && _a !== void 0 ? _a : settings.transferWindowEndsAt) !== null && _b !== void 0 ? _b : null;
    if (settings.deadlineDayEnabled &&
        settings.deadlineStartsAt &&
        deadlineEnd &&
        now >= settings.deadlineStartsAt &&
        now <= deadlineEnd) {
        return settings.deadlineBidTimerSeconds;
    }
    return settings.bidTimerSeconds;
}
function isMarketLocked(settings, now) {
    if (now === void 0) { now = new Date(); }
    if (!(settings === null || settings === void 0 ? void 0 : settings.transferWindowEndsAt))
        return false;
    return now >= settings.transferWindowEndsAt;
}
function returnResaleToSeller(auction) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!(auction.isResale && auction.sellerId)) return [3 /*break*/, 2];
                    return [4 /*yield*/, prisma_1.prisma.$transaction([
                            prisma_1.prisma.auction.update({
                                where: { id: auction.id },
                                data: { status: "cancelled" },
                            }),
                            prisma_1.prisma.player.update({
                                where: { id: auction.playerId },
                                data: { status: "owned" },
                            }),
                            prisma_1.prisma.squadPlayer.create({
                                data: {
                                    userId: auction.sellerId,
                                    playerId: auction.playerId,
                                    purchasePrice: auction.currentBid,
                                    isStarting: false,
                                },
                            }),
                        ])];
                case 1:
                    _a.sent();
                    return [3 /*break*/, 4];
                case 2: return [4 /*yield*/, prisma_1.prisma.$transaction([
                        prisma_1.prisma.auction.update({
                            where: { id: auction.id },
                            data: { status: "cancelled" },
                        }),
                        prisma_1.prisma.player.update({
                            where: { id: auction.playerId },
                            data: { status: "available" },
                        }),
                    ])];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4: return [2 /*return*/];
            }
        });
    });
}
/** Close an auction — winner gets player, budget deducted, or cancel if no bids */
function closeAuction(auctionId) {
    return __awaiter(this, void 0, void 0, function () {
        var auction, winnerId, finalBid, winner, winCheck, ops, rebate, refund;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, prisma_1.prisma.auction.findUnique({
                        where: { id: auctionId },
                        include: {
                            player: true,
                            room: true,
                        },
                    })];
                case 1:
                    auction = _d.sent();
                    if (!auction || auction.status !== "active")
                        return [2 /*return*/, null];
                    return [4 /*yield*/, (0, timerStore_1.clearAuctionEnd)(auctionId)];
                case 2:
                    _d.sent();
                    if (!!auction.currentBidderId) return [3 /*break*/, 4];
                    return [4 /*yield*/, returnResaleToSeller(auction)];
                case 3:
                    _d.sent();
                    return [2 /*return*/, {
                            auctionId: auctionId,
                            status: "cancelled",
                            sellerId: (_a = auction.sellerId) !== null && _a !== void 0 ? _a : undefined,
                            playerId: auction.playerId,
                            playerName: auction.player.name,
                            finalBid: auction.currentBid,
                            roomCode: auction.room.code,
                            isResale: auction.isResale,
                        }];
                case 4:
                    winnerId = auction.currentBidderId;
                    finalBid = auction.currentBid;
                    return [4 /*yield*/, prisma_1.prisma.user.findUnique({
                            where: { id: winnerId },
                            select: { id: true, displayName: true, teamName: true, budget: true },
                        })];
                case 5:
                    winner = _d.sent();
                    if (!!winner) return [3 /*break*/, 7];
                    return [4 /*yield*/, returnResaleToSeller(auction)];
                case 6:
                    _d.sent();
                    return [2 /*return*/, null];
                case 7: return [4 /*yield*/, (0, budget_1.canUserWinAuction)(winnerId)];
                case 8:
                    winCheck = _d.sent();
                    if (!(!winCheck.ok || winner.budget < finalBid)) return [3 /*break*/, 10];
                    return [4 /*yield*/, returnResaleToSeller(auction)];
                case 9:
                    _d.sent();
                    return [2 /*return*/, {
                            auctionId: auctionId,
                            status: "cancelled",
                            sellerId: (_b = auction.sellerId) !== null && _b !== void 0 ? _b : undefined,
                            playerId: auction.playerId,
                            playerName: auction.player.name,
                            finalBid: finalBid,
                            roomCode: auction.room.code,
                            isResale: auction.isResale,
                        }];
                case 10:
                    if (!(auction.isResale && auction.sellerId === winnerId)) return [3 /*break*/, 12];
                    return [4 /*yield*/, returnResaleToSeller(auction)];
                case 11:
                    _d.sent();
                    return [2 /*return*/, {
                            auctionId: auctionId,
                            status: "cancelled",
                            sellerId: auction.sellerId,
                            playerId: auction.playerId,
                            playerName: auction.player.name,
                            finalBid: finalBid,
                            roomCode: auction.room.code,
                            isResale: true,
                        }];
                case 12:
                    ops = [
                        prisma_1.prisma.auction.update({
                            where: { id: auctionId },
                            data: { status: "closed" },
                        }),
                        prisma_1.prisma.player.update({
                            where: { id: auction.playerId },
                            data: { status: "owned" },
                        }),
                        prisma_1.prisma.user.update({
                            where: { id: winnerId },
                            data: { budget: { decrement: finalBid } },
                        }),
                        prisma_1.prisma.squadPlayer.create({
                            data: {
                                userId: winnerId,
                                playerId: auction.playerId,
                                purchasePrice: finalBid,
                                isStarting: false,
                            },
                        }),
                    ];
                    // Resale: pay the seller
                    if (auction.isResale && auction.sellerId) {
                        ops.push(prisma_1.prisma.user.update({
                            where: { id: auction.sellerId },
                            data: { budget: { increment: finalBid } },
                        }));
                    }
                    return [4 /*yield*/, prisma_1.prisma.$transaction(ops)];
                case 13:
                    _d.sent();
                    return [4 /*yield*/, prisma_1.prisma.marketEffect.findFirst({
                            where: { roomId: auction.roomId, type: "fee_rebate", casterId: winnerId },
                        })];
                case 14:
                    rebate = _d.sent();
                    if (!rebate) return [3 /*break*/, 17];
                    refund = Math.floor(finalBid * 0.1);
                    return [4 /*yield*/, prisma_1.prisma.user.update({
                            where: { id: winnerId },
                            data: { budget: { increment: refund } },
                        })];
                case 15:
                    _d.sent();
                    return [4 /*yield*/, prisma_1.prisma.marketEffect.delete({ where: { id: rebate.id } })];
                case 16:
                    _d.sent();
                    _d.label = 17;
                case 17: return [2 /*return*/, {
                        auctionId: auctionId,
                        status: "closed",
                        winnerId: winnerId,
                        winnerName: winner.displayName,
                        winnerTeam: winner.teamName,
                        sellerId: (_c = auction.sellerId) !== null && _c !== void 0 ? _c : undefined,
                        playerId: auction.playerId,
                        playerName: auction.player.name,
                        finalBid: finalBid,
                        roomCode: auction.room.code,
                        isResale: auction.isResale,
                    }];
            }
        });
    });
}
