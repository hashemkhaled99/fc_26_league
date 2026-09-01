"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POSITIONS = exports.BID_EXTEND_BY_SEC = exports.BID_EXTEND_THRESHOLD_SEC = exports.BID_RATE_LIMIT_MS = exports.DEFAULT_STARTING_BID = exports.MIN_BID_INCREMENT = exports.MAX_STARTERS = exports.SQUAD_LIMIT = void 0;
exports.SQUAD_LIMIT = 18;
exports.MAX_STARTERS = 11;
exports.MIN_BID_INCREMENT = 1000000; // 1M
exports.DEFAULT_STARTING_BID = 5000000; // 5M
exports.BID_RATE_LIMIT_MS = 500;
/** When a bid is placed with this many seconds or less remaining, extend the timer. */
exports.BID_EXTEND_THRESHOLD_SEC = 30;
exports.BID_EXTEND_BY_SEC = 30;
exports.POSITIONS = [
    "GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "ST",
];
