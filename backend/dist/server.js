"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
var http_1 = require("http");
var url_1 = require("url");
var next_1 = __importDefault(require("next"));
var socket_io_1 = require("socket.io");
var PORT = parseInt((_a = process.env.PORT) !== null && _a !== void 0 ? _a : "4000", 10);
var CHECK_INTERVAL_MS = 1000;
var dev = process.env.NODE_ENV !== "production";
if (!process.env.DATABASE_URL) {
    console.error("FATAL: DATABASE_URL is required. Link the Northflank Postgres addon or set DATABASE_URL in your service environment.");
    process.exit(1);
}
var frontendOrigin = (_b = process.env.FRONTEND_URL) !== null && _b !== void 0 ? _b : "http://localhost:3000";
var nextApp = (0, next_1.default)({ dev: dev, hostname: "0.0.0.0", port: PORT });
var handle = nextApp.getRequestHandler();
var roomMembers = new Map();
function readBody(req) {
    return new Promise(function (resolve, reject) {
        var chunks = [];
        req.on("data", function (c) { return chunks.push(c); });
        req.on("end", function () { return resolve(Buffer.concat(chunks).toString()); });
        req.on("error", reject);
    });
}
function handleHealth(res) {
    return __awaiter(this, void 0, void 0, function () {
        var db, redis, prisma, _a, pingRedis, body;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    db = false;
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require("./src/lib/prisma")); })];
                case 2:
                    prisma = (_b.sent()).prisma;
                    return [4 /*yield*/, prisma.$queryRaw(templateObject_1 || (templateObject_1 = __makeTemplateObject(["SELECT 1"], ["SELECT 1"])))];
                case 3:
                    _b.sent();
                    db = true;
                    return [3 /*break*/, 5];
                case 4:
                    _a = _b.sent();
                    db = false;
                    return [3 /*break*/, 5];
                case 5:
                    if (!process.env.REDIS_URL) return [3 /*break*/, 8];
                    return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require("./src/lib/timerStore")); })];
                case 6:
                    pingRedis = (_b.sent()).pingRedis;
                    return [4 /*yield*/, pingRedis()];
                case 7:
                    redis = _b.sent();
                    _b.label = 8;
                case 8:
                    body = { status: "ok", db: db };
                    if (process.env.REDIS_URL) {
                        body.redis = redis;
                    }
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify(body));
                    return [2 /*return*/];
            }
        });
    });
}
function handleInternalEmit(req, res, io) {
    return __awaiter(this, void 0, void 0, function () {
        var body, _a, _b, roomCode, event_1, data, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 2, , 3]);
                    _b = (_a = JSON).parse;
                    return [4 /*yield*/, readBody(req)];
                case 1:
                    body = _b.apply(_a, [_d.sent()]);
                    roomCode = body.roomCode, event_1 = body.event, data = body.data;
                    io.to(roomCode.toUpperCase()).emit(event_1, data);
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ ok: true }));
                    return [3 /*break*/, 3];
                case 2:
                    _c = _d.sent();
                    res.writeHead(400);
                    res.end("Bad request");
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function () {
        function runAuctionCloser() {
            return __awaiter(this, void 0, void 0, function () {
                var _a, getExpiredAuctionIds, clearAuctionEnd, closeAuction, prisma, memoryExpired, dbExpired, expiredIds, _i, expiredIds_1, auctionId, result, err_1;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            _b.trys.push([0, 11, , 12]);
                            return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require("./src/lib/timerStore")); })];
                        case 1:
                            _a = _b.sent(), getExpiredAuctionIds = _a.getExpiredAuctionIds, clearAuctionEnd = _a.clearAuctionEnd;
                            return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require("./src/lib/auction/close")); })];
                        case 2:
                            closeAuction = (_b.sent()).closeAuction;
                            return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require("./src/lib/prisma")); })];
                        case 3:
                            prisma = (_b.sent()).prisma;
                            return [4 /*yield*/, getExpiredAuctionIds()];
                        case 4:
                            memoryExpired = _b.sent();
                            return [4 /*yield*/, prisma.auction.findMany({
                                    where: { status: "active", endsAt: { lte: new Date() } },
                                    select: { id: true },
                                    take: 20,
                                })];
                        case 5:
                            dbExpired = _b.sent();
                            expiredIds = __spreadArray([], new Set(__spreadArray(__spreadArray([], memoryExpired, true), dbExpired.map(function (a) { return a.id; }), true)), true);
                            _i = 0, expiredIds_1 = expiredIds;
                            _b.label = 6;
                        case 6:
                            if (!(_i < expiredIds_1.length)) return [3 /*break*/, 10];
                            auctionId = expiredIds_1[_i];
                            return [4 /*yield*/, closeAuction(auctionId)];
                        case 7:
                            result = _b.sent();
                            return [4 /*yield*/, clearAuctionEnd(auctionId)];
                        case 8:
                            _b.sent();
                            if (!result)
                                return [3 /*break*/, 9];
                            io.to(result.roomCode).emit("auction:closed", result);
                            if (result.status === "closed" && result.winnerId) {
                                io.to(result.roomCode).emit("squad:updated", { userId: result.winnerId });
                            }
                            if (result.sellerId) {
                                io.to(result.roomCode).emit("squad:updated", { userId: result.sellerId });
                            }
                            _b.label = 9;
                        case 9:
                            _i++;
                            return [3 /*break*/, 6];
                        case 10: return [3 /*break*/, 12];
                        case 11:
                            err_1 = _b.sent();
                            console.error("Auction closer error:", err_1);
                            return [3 /*break*/, 12];
                        case 12: return [2 /*return*/];
                    }
                });
            });
        }
        function runTransferWindowWatcher() {
            return __awaiter(this, void 0, void 0, function () {
                var prisma, forceCloseAllAuctions, due, dueIds_1, _i, due_1, s, active, err_2;
                var _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            _b.trys.push([0, 10, , 11]);
                            return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require("./src/lib/prisma")); })];
                        case 1:
                            prisma = (_b.sent()).prisma;
                            return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require("./src/lib/admin/market")); })];
                        case 2:
                            forceCloseAllAuctions = (_b.sent()).forceCloseAllAuctions;
                            return [4 /*yield*/, prisma.roomSettings.findMany({
                                    where: {
                                        transferWindowEndsAt: { lte: new Date() },
                                        room: { phase: "bidding" },
                                    },
                                    include: { room: { select: { id: true, code: true } } },
                                    take: 10,
                                })];
                        case 3:
                            due = _b.sent();
                            dueIds_1 = new Set(due.map(function (s) { return s.roomId; }));
                            lockedRooms.forEach(function (id) {
                                if (!dueIds_1.has(id))
                                    lockedRooms.delete(id);
                            });
                            _i = 0, due_1 = due;
                            _b.label = 4;
                        case 4:
                            if (!(_i < due_1.length)) return [3 /*break*/, 9];
                            s = due_1[_i];
                            if (lockedRooms.has(s.roomId))
                                return [3 /*break*/, 8];
                            lockedRooms.add(s.roomId);
                            return [4 /*yield*/, prisma.auction.count({
                                    where: { roomId: s.roomId, status: "active" },
                                })];
                        case 5:
                            active = _b.sent();
                            if (!(active > 0)) return [3 /*break*/, 7];
                            return [4 /*yield*/, forceCloseAllAuctions(s.roomId, s.room.code)];
                        case 6:
                            _b.sent();
                            _b.label = 7;
                        case 7:
                            io.to(s.room.code).emit("market:locked", { reason: "window_ended" });
                            io.to(s.room.code).emit("settings:updated", {
                                transferWindowEndsAt: (_a = s.transferWindowEndsAt) === null || _a === void 0 ? void 0 : _a.toISOString(),
                                marketLocked: true,
                            });
                            _b.label = 8;
                        case 8:
                            _i++;
                            return [3 /*break*/, 4];
                        case 9: return [3 /*break*/, 11];
                        case 10:
                            err_2 = _b.sent();
                            console.error("Transfer window watcher error:", err_2);
                            return [3 /*break*/, 11];
                        case 11: return [2 /*return*/];
                    }
                });
            });
        }
        var httpServer, io, lockedRooms;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, nextApp.prepare()];
                case 1:
                    _a.sent();
                    httpServer = (0, http_1.createServer)();
                    io = new socket_io_1.Server(httpServer, {
                        cors: {
                            origin: frontendOrigin,
                            methods: ["GET", "POST"],
                        },
                    });
                    httpServer.on("request", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                        var parsedUrl, pathname;
                        var _a, _b;
                        return __generator(this, function (_c) {
                            switch (_c.label) {
                                case 0:
                                    parsedUrl = (0, url_1.parse)((_a = req.url) !== null && _a !== void 0 ? _a : "", true);
                                    pathname = (_b = parsedUrl.pathname) !== null && _b !== void 0 ? _b : "";
                                    if (!(req.method === "GET" && pathname === "/health")) return [3 /*break*/, 2];
                                    return [4 /*yield*/, handleHealth(res)];
                                case 1:
                                    _c.sent();
                                    return [2 /*return*/];
                                case 2:
                                    if (!(req.method === "POST" && pathname === "/internal/emit")) return [3 /*break*/, 4];
                                    return [4 /*yield*/, handleInternalEmit(req, res, io)];
                                case 3:
                                    _c.sent();
                                    return [2 /*return*/];
                                case 4: return [4 /*yield*/, handle(req, res, parsedUrl)];
                                case 5:
                                    _c.sent();
                                    return [2 /*return*/];
                            }
                        });
                    }); });
                    io.on("connection", function (socket) {
                        console.log("Socket connected: ".concat(socket.id));
                        socket.on("room:join", function (_a) {
                            var roomCode = _a.roomCode;
                            var code = roomCode.toUpperCase();
                            socket.join(code);
                            if (!roomMembers.has(code))
                                roomMembers.set(code, new Set());
                            roomMembers.get(code).add(socket.id);
                            socket.emit("room:joined", {
                                roomCode: code,
                                memberCount: roomMembers.get(code).size,
                            });
                            io.to(code).emit("lobby:updated", { memberCount: roomMembers.get(code).size });
                        });
                        socket.on("disconnect", function () {
                            for (var _i = 0, _a = roomMembers.entries(); _i < _a.length; _i++) {
                                var _b = _a[_i], code = _b[0], members = _b[1];
                                if (members.has(socket.id)) {
                                    members.delete(socket.id);
                                    io.to(code).emit("lobby:updated", { memberCount: members.size });
                                }
                            }
                            console.log("Socket disconnected: ".concat(socket.id));
                        });
                    });
                    lockedRooms = new Set();
                    setInterval(runAuctionCloser, CHECK_INTERVAL_MS);
                    setInterval(runTransferWindowWatcher, 5000);
                    httpServer.listen(PORT, function () {
                        console.log("FC26 backend (API + Socket.io) running on port ".concat(PORT));
                    });
                    return [2 /*return*/];
            }
        });
    });
}
main().catch(function (err) {
    console.error("Failed to start backend:", err);
    process.exit(1);
});
var templateObject_1;
