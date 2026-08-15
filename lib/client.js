window.__ModuleLoader__.load({
	id: "dsh-deepseek-quota",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");

		//#region constants
		const TOP_UP_URL = "https://platform.deepseek.com/top_up";
		// 与 DeepSeek 官网充值页一致的金额档位（CNY / USD）
		const TIERS = {
			CNY: [10, 20, 50, 100, 300, 500],
			USD: [2, 5, 10, 20, 50, 100, 500],
		};
		// 与官网一致的支付方式（支付宝 / 微信 / 银行卡）
		const METHODS = [
			{ id: "alipay", label: "支付宝", desc: "支付宝扫码支付" },
			{ id: "wechat", label: "微信", desc: "微信扫码支付" },
			{ id: "card", label: "银行卡", desc: "银行卡支付" },
		];
		//#endregion

		//#region qr encoder — compact QR Code generator (byte mode, ECC-M, auto version/mask)
		// Adapted from Project Nayuki's "QR Code generator library" (MIT License),
		// https://www.nayuki.io/page/qr-code-generator-library — logic transcribed 1:1.
		function qrEncode(text) {
			const ECC_CODEWORDS_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
			const NUM_ERROR_CORRECTION_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];
			function appendBits(val, len, bb) {
				if (len < 0 || len > 31 || val >>> len !== 0) throw new RangeError("Value out of range");
				for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1);
			}
			function getBit(x, i) { return ((x >>> i) & 1) !== 0; }
			function toUtf8ByteArray(str) {
				str = encodeURI(str);
				const result = [];
				for (let i = 0; i < str.length; i++) {
					if (str.charAt(i) !== "%") result.push(str.charCodeAt(i));
					else { result.push(parseInt(str.substring(i + 1, i + 3), 16)); i += 2; }
				}
				return result;
			}
			function getNumRawDataModules(ver) {
				let result = (16 * ver + 128) * ver + 64;
				if (ver >= 2) {
					const numAlign = Math.floor(ver / 7) + 2;
					result -= (25 * numAlign - 10) * numAlign - 55;
					if (ver >= 7) result -= 36;
				}
				return result;
			}
			function getNumDataCodewords(ver) {
				return Math.floor(getNumRawDataModules(ver) / 8) - ECC_CODEWORDS_PER_BLOCK[ver] * NUM_ERROR_CORRECTION_BLOCKS[ver];
			}
			function getAlignmentPatternPositions(ver, size) {
				if (ver === 1) return [];
				const numAlign = Math.floor(ver / 7) + 2;
				const step = Math.floor((ver * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2;
				const result = [6];
				for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
				return result;
			}
			function reedSolomonMultiply(x, y) {
				let z = 0;
				for (let i = 7; i >= 0; i--) {
					z = (z << 1) ^ ((z >>> 7) * 0x11D);
					z ^= ((y >>> i) & 1) * x;
				}
				return z;
			}
			function reedSolomonComputeDivisor(degree) {
				const result = [];
				for (let i = 0; i < degree - 1; i++) result.push(0);
				result.push(1);
				let root = 1;
				for (let i = 0; i < degree; i++) {
					for (let j = 0; j < result.length; j++) {
						result[j] = reedSolomonMultiply(result[j], root);
						if (j + 1 < result.length) result[j] ^= result[j + 1];
					}
					root = reedSolomonMultiply(root, 0x02);
				}
				return result;
			}
			function reedSolomonComputeRemainder(data, divisor) {
				const result = divisor.map(() => 0);
				for (const b of data) {
					const factor = b ^ result.shift();
					result.push(0);
					divisor.forEach((coef, i) => { result[i] ^= reedSolomonMultiply(coef, factor); });
				}
				return result;
			}
			function addEccAndInterleave(data, ver) {
				const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ver];
				const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ver];
				const rawCodewords = Math.floor(getNumRawDataModules(ver) / 8);
				const numShortBlocks = numBlocks - rawCodewords % numBlocks;
				const shortBlockLen = Math.floor(rawCodewords / numBlocks);
				const blocks = [];
				const rsDiv = reedSolomonComputeDivisor(blockEccLen);
				for (let i = 0, k = 0; i < numBlocks; i++) {
					let dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
					k += dat.length;
					const ecc = reedSolomonComputeRemainder(dat, rsDiv);
					if (i < numShortBlocks) dat.push(0);
					blocks.push(dat.concat(ecc));
				}
				const result = [];
				for (let i = 0; i < blocks[0].length; i++) {
					blocks.forEach((block, j) => {
						if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i]);
					});
				}
				return result;
			}

			const bytes = toUtf8ByteArray(text);
			const segData = [];
			for (const b of bytes) appendBits(b, 8, segData);
			const segNumChars = bytes.length;

			let version = 1;
			for (; ; version++) {
				const dataCapacityBits = getNumDataCodewords(version) * 8;
				const usedBits = 4 + (version <= 9 ? 8 : 16) + segData.length;
				if (usedBits <= dataCapacityBits) break;
				if (version >= 40) throw new RangeError("Data too long");
			}

			const bb = [];
			appendBits(0x4, 4, bb);
			appendBits(segNumChars, version <= 9 ? 8 : 16, bb);
			for (const b of segData) bb.push(b);
			const dataCapacityBits = getNumDataCodewords(version) * 8;
			appendBits(0, Math.min(4, dataCapacityBits - bb.length), bb);
			appendBits(0, (8 - bb.length % 8) % 8, bb);
			for (let padByte = 0xEC; bb.length < dataCapacityBits; padByte ^= 0xEC ^ 0x11) appendBits(padByte, 8, bb);
			const dataCodewords = [];
			while (dataCodewords.length * 8 < bb.length) dataCodewords.push(0);
			bb.forEach((b, i) => { dataCodewords[i >>> 3] |= b << (7 - (i & 7)); });

			const size = version * 4 + 17;
			const modules = [];
			const isFunction = [];
			for (let i = 0; i < size; i++) {
				const row = [];
				for (let j = 0; j < size; j++) row.push(false);
				modules.push(row.slice());
				isFunction.push(row.slice());
			}
			function setFunctionModule(x, y, isDark) { modules[y][x] = isDark; isFunction[y][x] = true; }
			function drawFunctionPatterns() {
				for (let i = 0; i < size; i++) {
					setFunctionModule(6, i, i % 2 === 0);
					setFunctionModule(i, 6, i % 2 === 0);
				}
				drawFinderPattern(3, 3);
				drawFinderPattern(size - 4, 3);
				drawFinderPattern(3, size - 4);
				const alignPatPos = getAlignmentPatternPositions(version, size);
				const numAlign = alignPatPos.length;
				for (let i = 0; i < numAlign; i++) {
					for (let j = 0; j < numAlign; j++) {
						if (!(i === 0 && j === 0 || i === 0 && j === numAlign - 1 || i === numAlign - 1 && j === 0)) {
							drawAlignmentPattern(alignPatPos[i], alignPatPos[j]);
						}
					}
				}
				drawFormatBits(0);
				drawVersion();
			}
			function drawFinderPattern(x, y) {
				for (let dy = -4; dy <= 4; dy++) {
					for (let dx = -4; dx <= 4; dx++) {
						const dist = Math.max(Math.abs(dx), Math.abs(dy));
						const xx = x + dx, yy = y + dy;
						if (0 <= xx && xx < size && 0 <= yy && yy < size) setFunctionModule(xx, yy, dist !== 2 && dist !== 4);
					}
				}
			}
			function drawAlignmentPattern(x, y) {
				for (let dy = -2; dy <= 2; dy++) {
					for (let dx = -2; dx <= 2; dx++) setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
				}
			}
			function drawFormatBits(mask) {
				const data = mask; // ECC level M → formatBits 0
				let rem = data;
				for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
				const bits = (data << 10 | rem) ^ 0x5412;
				for (let i = 0; i <= 5; i++) setFunctionModule(8, i, getBit(bits, i));
				setFunctionModule(8, 7, getBit(bits, 6));
				setFunctionModule(8, 8, getBit(bits, 7));
				setFunctionModule(7, 8, getBit(bits, 8));
				for (let i = 9; i < 15; i++) setFunctionModule(14 - i, 8, getBit(bits, i));
				for (let i = 0; i < 8; i++) setFunctionModule(size - 1 - i, 8, getBit(bits, i));
				for (let i = 8; i < 15; i++) setFunctionModule(8, size - 15 + i, getBit(bits, i));
				setFunctionModule(8, size - 8, true);
			}
			function drawVersion() {
				if (version < 7) return;
				let rem = version;
				for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
				const bits = version << 12 | rem;
				for (let i = 0; i < 18; i++) {
					const color = getBit(bits, i);
					const a = size - 11 + i % 3;
					const b = Math.floor(i / 3);
					setFunctionModule(a, b, color);
					setFunctionModule(b, a, color);
				}
			}
			function drawCodewords(data) {
				let i = 0;
				for (let right = size - 1; right >= 1; right -= 2) {
					if (right === 6) right = 5;
					for (let vert = 0; vert < size; vert++) {
						for (let j = 0; j < 2; j++) {
							const x = right - j;
							const upward = ((right + 1) & 2) === 0;
							const y = upward ? size - 1 - vert : vert;
							if (!isFunction[y][x] && i < data.length * 8) {
								modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7));
								i++;
							}
						}
					}
				}
			}
			function applyMask(mask) {
				for (let y = 0; y < size; y++) {
					for (let x = 0; x < size; x++) {
						let invert;
						switch (mask) {
							case 0: invert = (x + y) % 2 === 0; break;
							case 1: invert = y % 2 === 0; break;
							case 2: invert = x % 3 === 0; break;
							case 3: invert = (x + y) % 3 === 0; break;
							case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
							case 5: invert = x * y % 2 + x * y % 3 === 0; break;
							case 6: invert = (x * y % 2 + x * y % 3) % 2 === 0; break;
							case 7: invert = ((x + y) % 2 + x * y % 3) % 2 === 0; break;
							default: throw new Error("Unreachable");
						}
						if (!isFunction[y][x] && invert) modules[y][x] = !modules[y][x];
					}
				}
			}
			function finderPenaltyCountPatterns(runHistory) {
				const n = runHistory[1];
				const core = n > 0 && runHistory[2] === n && runHistory[3] === n * 3 && runHistory[4] === n && runHistory[5] === n;
				return ((core && runHistory[0] >= n * 4 && runHistory[6] >= n ? 1 : 0) +
						(core && runHistory[6] >= n * 4 && runHistory[0] >= n ? 1 : 0));
			}
			function finderPenaltyTerminateAndCount(currentRunColor, currentRunLength, runHistory) {
				if (currentRunColor) {
					finderPenaltyAddHistory(currentRunLength, runHistory);
					currentRunLength = 0;
				}
				currentRunLength += size;
				finderPenaltyAddHistory(currentRunLength, runHistory);
				return finderPenaltyCountPatterns(runHistory);
			}
			function finderPenaltyAddHistory(currentRunLength, runHistory) {
				if (runHistory[0] === 0) currentRunLength += size;
				runHistory.pop();
				runHistory.unshift(currentRunLength);
			}
			function getPenaltyScore() {
				let result = 0;
				for (let y = 0; y < size; y++) {
					let runColor = false, runX = 0;
					const runHistory = [0, 0, 0, 0, 0, 0, 0];
					for (let x = 0; x < size; x++) {
						if (modules[y][x] === runColor) {
							runX++;
							if (runX === 5) result += 3;
							else if (runX > 5) result++;
						} else {
							finderPenaltyAddHistory(runX, runHistory);
							if (!runColor) result += finderPenaltyCountPatterns(runHistory) * 40;
							runColor = modules[y][x];
							runX = 1;
						}
					}
					result += finderPenaltyTerminateAndCount(runColor, runX, runHistory) * 40;
				}
				for (let x = 0; x < size; x++) {
					let runColor = false, runY = 0;
					const runHistory = [0, 0, 0, 0, 0, 0, 0];
					for (let y = 0; y < size; y++) {
						if (modules[y][x] === runColor) {
							runY++;
							if (runY === 5) result += 3;
							else if (runY > 5) result++;
						} else {
							finderPenaltyAddHistory(runY, runHistory);
							if (!runColor) result += finderPenaltyCountPatterns(runHistory) * 40;
							runColor = modules[y][x];
							runY = 1;
						}
					}
					result += finderPenaltyTerminateAndCount(runColor, runY, runHistory) * 40;
				}
				for (let y = 0; y < size - 1; y++) {
					for (let x = 0; x < size - 1; x++) {
						const color = modules[y][x];
						if (color === modules[y][x + 1] && color === modules[y + 1][x] && color === modules[y + 1][x + 1]) result += 3;
					}
				}
				let dark = 0;
				for (const row of modules) dark = row.reduce((sum, c) => sum + (c ? 1 : 0), dark);
				const total = size * size;
				const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
				result += k * 10;
				return result;
			}

			drawFunctionPatterns();
			const allCodewords = addEccAndInterleave(dataCodewords, version);
			drawCodewords(allCodewords);
			let mask = -1;
			let minPenalty = 1000000000;
			for (let i = 0; i < 8; i++) {
				applyMask(i);
				drawFormatBits(i);
				const penalty = getPenaltyScore();
				if (penalty < minPenalty) { mask = i; minPenalty = penalty; }
				applyMask(i);
			}
			applyMask(mask);
			drawFormatBits(mask);
			return { version, mask, size, modules };
		}
		//#endregion

		//#region recharge store（卡片与充值面板共享的内存状态）
		const store = {
			open: false,
			step: "form", // form | qr
			currency: "CNY",
			amount: null,
			custom: "",
			method: "alipay",
			listeners: new Set(),
		};
		function setStore(patch) {
			Object.assign(store, patch);
			store.listeners.forEach((fn) => fn());
		}
		function subscribe(fn) {
			store.listeners.add(fn);
			return () => store.listeners.delete(fn);
		}
		function openRecharge(currency) {
			setStore({ open: true, step: "form", currency: currency || "CNY", amount: null, custom: "", method: "alipay" });
		}
		function closeRecharge() { setStore({ open: false }); }
		//#endregion

		//#region styles
		const CSS = '[data-dsh-quota-cell]{box-sizing:border-box;font-family:inherit;text-align:left}' +
			'[data-dsh-quota-wide="true"]{width:calc(100% + 8px);margin:6px -4px 0;border-radius:12px;padding:8px 10px;display:flex;flex-direction:column;gap:2px;color:var(--dsw-alias-label-primary);background:transparent;cursor:default}' +
			'[data-dsh-quota-wide="true"]:hover{background:var(--dsw-alias-interactive-bg-hover)}' +
			'.dshq-head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}' +
			'.dshq-title{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
			'.dshq-actions{display:flex;align-items:center;gap:2px;flex:none;min-width:0}' +
			'.dshq-recharge{flex:none;height:22px;padding:0 7px;display:inline-flex;align-items:center;justify-content:center;border:none;background:transparent;border-radius:6px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1;cursor:pointer;white-space:nowrap}' +
			'.dshq-recharge:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}' +
			'.dshq-refresh{flex:none;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;border:none;background:transparent;border-radius:6px;color:var(--dsw-alias-label-tertiary);cursor:pointer;padding:0}' +
			'.dshq-refresh:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}' +
			'.dshq-refresh:disabled{opacity:.5;cursor:default}' +
			'.dshq-refresh[data-busy="true"] svg{animation:dshq-spin 1s linear infinite}' +
			'@keyframes dshq-spin{to{transform:rotate(360deg)}}' +
			'.dshq-value{font-size:16px;font-weight:500;line-height:24px;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}' +
			'.dshq-value[data-low="true"]{color:var(--dsw-alias-state-error-primary)}' +
			'.dshq-meta{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
			'.dshq-meta[data-error="true"]{color:var(--dsw-alias-state-error-primary)}' +
			'.dshq-caption{color:var(--dsw-alias-label-caption);font-size:11px;line-height:16px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
			'.dshq-caption[data-error="true"]{color:var(--dsw-alias-state-error-primary)}' +
			'[data-dsh-quota-cell][data-dsh-quota-wide="false"]{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary);cursor:pointer;background:transparent;border:none;font-size:14px;line-height:1}' +
			'[data-dsh-quota-cell][data-dsh-quota-wide="false"]:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}' +
			'[data-dsh-quota-cell][data-dsh-quota-wide="false"][data-low="true"]{color:var(--dsw-alias-state-error-primary)}' +
			'div:has(> [data-slot="sidebar.footer.action"] > [data-dsh-quota-cell][data-dsh-quota-wide="true"]){flex-direction:column;align-items:stretch}' +
			/* 充值面板（shell.overlay 居中模态） */
			'.dshq-modal{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center}' +
			'.dshq-scrim{position:absolute;inset:0;background:rgba(15,23,42,.45)}' +
			'.dshq-panel{position:relative;width:min(430px,calc(100vw - 48px));max-height:calc(100vh - 64px);overflow:auto;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);border-radius:16px;box-shadow:0 24px 64px rgba(0,0,0,.22);padding:20px;display:flex;flex-direction:column;gap:14px;color:var(--dsw-alias-label-primary);font-family:inherit}' +
			'.dshq-panel-head{display:flex;align-items:center;justify-content:space-between;gap:8px}' +
			'.dshq-panel-title{font-size:16px;font-weight:600;line-height:24px}' +
			'.dshq-close{flex:none;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;border:none;background:transparent;border-radius:7px;color:var(--dsw-alias-label-tertiary);cursor:pointer;font-size:15px;line-height:1}' +
			'.dshq-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}' +
			'.dshq-sec-title{font-size:12px;color:var(--dsw-alias-label-secondary);margin-bottom:8px}' +
			'.dshq-tiers{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}' +
			'.dshq-tier{height:36px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;font-variant-numeric:tabular-nums;cursor:pointer;font-family:inherit}' +
			'.dshq-tier:hover{border-color:var(--dsw-alias-brand-primary)}' +
			'.dshq-tier[data-on="true"]{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-brand-primary);color:#fff;font-weight:600}' +
			'.dshq-custom-row{display:flex;align-items:center;gap:8px}' +
			'.dshq-custom{flex:1;height:36px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;font-family:inherit;min-width:0}' +
			'.dshq-custom:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}' +
			'.dshq-custom-prefix{color:var(--dsw-alias-label-tertiary);font-size:13px;flex:none}' +
			'.dshq-methods{display:flex;flex-direction:column;gap:8px}' +
			'.dshq-method{display:flex;align-items:center;gap:10px;width:100%;height:44px;padding:0 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;font-family:inherit;text-align:left}' +
			'.dshq-method:hover{border-color:var(--dsw-alias-brand-primary)}' +
			'.dshq-method[data-on="true"]{border-color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 8%,transparent)}' +
			'.dshq-method-radio{flex:none;width:16px;height:16px;border-radius:50%;border:1.5px solid var(--dsw-alias-border-l2);display:inline-flex;align-items:center;justify-content:center}' +
			'.dshq-method[data-on="true"] .dshq-method-radio{border-color:var(--dsw-alias-brand-primary)}' +
			'.dshq-method[data-on="true"] .dshq-method-radio::after{content:"";width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-brand-primary)}' +
			'.dshq-method-label{font-size:13px;flex:none}' +
			'.dshq-method-desc{font-size:12px;color:var(--dsw-alias-label-tertiary);margin-left:auto}' +
			'.dshq-note{font-size:11px;line-height:16px;color:var(--dsw-alias-label-caption)}' +
			'.dshq-pay{width:100%;height:40px;border:none;border-radius:10px;background:var(--dsw-alias-brand-primary);color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit}' +
			'.dshq-pay:hover{filter:brightness(1.06)}' +
			'.dshq-pay:disabled{opacity:.5;cursor:default;filter:none}' +
			/* 二维码视图 */
			'.dshq-qr-view{display:flex;flex-direction:column;align-items:center;gap:12px}' +
			'.dshq-qr-box{background:#fff;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:14px;box-shadow:0 8px 24px rgba(0,0,0,.08)}' +
			'.dshq-qr{width:208px;height:208px;display:block}' +
			'.dshq-qr-sum{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}' +
			'.dshq-qr-note{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);text-align:center}' +
			'.dshq-qr-actions{display:flex;gap:8px;width:100%}' +
			'.dshq-btn{flex:1;height:36px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:13px;font-family:inherit}' +
			'.dshq-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}' +
			'.dshq-btn-primary{flex:1.4;height:36px;border-radius:9px;border:none;background:var(--dsw-alias-brand-primary);color:#fff;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit}' +
			'.dshq-btn-primary:hover{filter:brightness(1.06)}';
		const tagId = "dsh-deepseek-quota/styles";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-deepseek-quota";
			tag.dataset.pluginCss = tagId;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}
		//#endregion

		const inject = ["slots", "layout"];

		function fmtMoney(n, currency) {
			const v = (Number.isFinite(n) ? n : 0).toFixed(2);
			return currency === "USD" ? "$" + v : "¥" + v;
		}
		function fmtAmount(n, currency) {
			return (currency === "USD" ? "$" : "¥") + n;
		}
		function fmtTime(iso) {
			if (!iso) return "";
			try { return new Date(iso).toLocaleTimeString("zh-CN", { hour12: false }); } catch (e) { return String(iso).slice(11, 19); }
		}

		/** 二维码 SVG：将 qrEncode 结果渲染为矢量图 */
		function QrSvg(props) {
			const qr = props.qr;
			const cells = [];
			for (let y = 0; y < qr.size; y++) {
				for (let x = 0; x < qr.size; x++) {
					if (qr.modules[y][x]) cells.push("M" + x + " " + y + "h1v1h-1z");
				}
			}
			return react.createElement("svg", {
				className: "dshq-qr",
				viewBox: "0 0 " + qr.size + " " + qr.size,
				shapeRendering: "crispEdges",
				role: "img",
				"aria-label": "DeepSeek 官方充值页二维码",
			}, react.createElement("path", { d: cells.join(""), fill: "#000" }));
		}

		/** 充值面板：注册在 shell.overlay（全屏浮层），居中模态 */
		function RechargePanel() {
			const [, force] = react.useReducer((x) => x + 1, 0);
			react.useEffect(() => subscribe(force), []);

			const s = store;
			const currency = s.currency === "USD" ? "USD" : "CNY";
			const tiers = TIERS[currency] || TIERS.CNY;
			const customNum = Number(s.custom);
			const customValid = s.custom !== "" && Number.isFinite(customNum) && customNum >= 1;
			const effectiveAmount = s.amount !== null ? s.amount : (customValid ? customNum : null);

			react.useEffect(() => {
				if (!s.open) return;
				const onKey = (e) => { if (e.key === "Escape") closeRecharge(); };
				window.addEventListener("keydown", onKey);
				return () => window.removeEventListener("keydown", onKey);
			}, [s.open]);

			if (!s.open) return null;

			const closeBtn = react.createElement("button", {
				type: "button",
				className: "dshq-close",
				"aria-label": "关闭",
				onClick: closeRecharge,
			}, "✕");

			const head = react.createElement("div", { className: "dshq-panel-head" },
				react.createElement("span", { className: "dshq-panel-title" }, "充值"),
				closeBtn,
			);

			let body;
			if (s.step === "form") {
				// 金额档位（与官网一致）
				const tierBtns = tiers.map((t) =>
					react.createElement("button", {
						type: "button",
						key: "t" + t,
						className: "dshq-tier",
						"data-on": s.amount === t ? "true" : undefined,
						onClick: () => setStore({ amount: t, custom: "" }),
					}, fmtAmount(t, currency)),
				);
				const customBtn = react.createElement("button", {
					type: "button",
					key: "tc",
					className: "dshq-tier",
					"data-on": s.amount === null && s.custom !== "" ? "true" : undefined,
					onClick: () => setStore({ amount: null }),
				}, "自定义");
				const amountSec = react.createElement("div", null,
					react.createElement("div", { className: "dshq-sec-title" }, "充值金额"),
					react.createElement("div", { className: "dshq-tiers" }, tierBtns.concat(customBtn)),
					react.createElement("div", { className: "dshq-custom-row", style: { marginTop: 8 } },
						react.createElement("span", { className: "dshq-custom-prefix" }, currency === "USD" ? "$" : "¥"),
						react.createElement("input", {
							className: "dshq-custom",
							type: "number",
							min: "1",
							step: "1",
							placeholder: "自定义金额",
							value: s.custom,
							onChange: (e) => setStore({ custom: e.target.value, amount: null }),
						}),
					),
				);

				// 支付方式（与官网一致）
				const methodBtns = METHODS.map((m) =>
					react.createElement("button", {
						type: "button",
						key: m.id,
						className: "dshq-method",
						"data-on": s.method === m.id ? "true" : undefined,
						onClick: () => setStore({ method: m.id }),
					},
						react.createElement("span", { className: "dshq-method-radio" }),
						react.createElement("span", { className: "dshq-method-label" }, m.label),
						react.createElement("span", { className: "dshq-method-desc" }, m.desc),
					),
				);
				const methodSec = react.createElement("div", null,
					react.createElement("div", { className: "dshq-sec-title" }, "支付方式"),
					react.createElement("div", { className: "dshq-methods" }, methodBtns),
				);

				const note = react.createElement("div", { className: "dshq-note" },
					"充值到当前 DeepSeek 开放平台账户（与 API Key 同账户），余额仅用于调用 API 服务。金额档位与支付方式与官网充值页一致。",
				);

				const payBtn = react.createElement("button", {
					type: "button",
					className: "dshq-pay",
					disabled: effectiveAmount === null ? true : undefined,
					onClick: () => setStore({ step: "qr", amount: effectiveAmount }),
				}, "去支付");

				body = react.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
					amountSec, methodSec, note, payBtn,
				);
			} else {
				// 二维码视图：扫码打开官方充值页（与官网「充值链接」一致）
				const method = METHODS.find((m) => m.id === s.method) || METHODS[0];
				const qr = qrEncode(TOP_UP_URL);
				const sumText = "金额 " + fmtAmount(s.amount, currency) + " · " + method.label;

				const qrBox = react.createElement("div", { className: "dshq-qr-box" },
					react.createElement(QrSvg, { qr }),
				);
				const sum = react.createElement("div", { className: "dshq-qr-sum" }, sumText);
				const note = react.createElement("div", { className: "dshq-qr-note" },
					"请使用" + method.label + "扫一扫，在手机上打开 DeepSeek 官方充值页完成支付（与官网「充值链接」一致）。",
				);
				const subNote = react.createElement("div", { className: "dshq-note", style: { textAlign: "center" } },
					"官方支付二维码由平台在登录后按订单生成；扫码后请在手机端确认金额 " + fmtAmount(s.amount, currency) + " 与支付方式 " + method.label + "。",
				);
				const backBtn = react.createElement("button", {
					type: "button",
					className: "dshq-btn",
					onClick: () => setStore({ step: "form" }),
				}, "返回修改");
				const openBtn = react.createElement("button", {
					type: "button",
					className: "dshq-btn-primary",
					onClick: () => { window.open(TOP_UP_URL, "_blank", "noopener,noreferrer"); },
				}, "在浏览器中打开官方充值页");
				const actions = react.createElement("div", { className: "dshq-qr-actions" }, backBtn, openBtn);

				body = react.createElement("div", { className: "dshq-qr-view" },
					qrBox, sum, note, subNote, actions,
				);
			}

			return react.createElement("div", { className: "dshq-modal" },
				react.createElement("div", { className: "dshq-scrim", onClick: closeRecharge }),
				react.createElement("div", { className: "dshq-panel", role: "dialog", "aria-modal": "true", "aria-label": "DeepSeek 充值",
					onClick: (e) => e.stopPropagation() },
					head, body,
				),
			);
		}

		/**
		 * 侧边栏底部“设置”上方的 DeepSeek 余额卡片。
		 * 数据来自同源路由 GET /dsh-quota/balance（Host 代理官方接口，Key 不出 Host）。
		 * 首次加载 + 每 60 秒自动刷新；组件卸载时清理定时器。
		 */
		function apply(ctx) {
			const slots = ctx.get("slots");
			if (slots === undefined) return;
			const layout = ctx.get("layout");

			slots.inject("sidebar.footer.action", () => slots.register(
				{ name: "sidebar.footer.action", id: "dsh-quota", order: -10, label: "DeepSeek 额度" },
				function QuotaCard(props) {
					const wide = !!props.wide;
					const [state, setState] = react.useState({ status: "loading", data: null, error: null, used: 0 });
					const initialTotalRef = react.useRef(null);
					const aliveRef = react.useRef(true);
					react.useEffect(() => {
						aliveRef.current = true;
						return () => { aliveRef.current = false; };
					}, []);

					const refresh = react.useCallback(async () => {
						setState((s) => ({ ...s, status: s.data ? "refreshing" : "loading" }));
						let res;
						try {
							const resp = await fetch("/dsh-quota/balance", { headers: { accept: "application/json" } });
							res = await resp.json();
						} catch (err) {
							if (aliveRef.current) setState((s) => ({ ...s, status: "error", error: "通信失败: " + String((err && err.message) || err) }));
							return;
						}
						if (!aliveRef.current) return;
						if (res && res.ok === true && res.data) {
							const cur = Number(res.data.totalBalance);
							const initial = initialTotalRef.current;
							if (initial === null) initialTotalRef.current = cur;
							const used = initial === null ? 0 : Math.max(0, initial - cur);
							setState({ status: "ready", data: res.data, error: null, used });
						} else {
							setState((s) => ({ ...s, status: "error", error: (res && res.message) || "获取失败" }));
						}
					}, []);

					react.useEffect(() => {
						refresh();
						const id = setInterval(refresh, 60000);
						return () => clearInterval(id);
					}, [refresh]);

					const s = state;
					const d = s.data;
					const busy = s.status === "loading" || s.status === "refreshing";
					const low = !!(d && (!d.isAvailable || d.totalBalance <= 0));

					const refreshIcon = react.createElement("svg", { width: 12, height: 12, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
						react.createElement("path", { d: "M23 4v6h-6" }),
						react.createElement("path", { d: "M20.49 15a9 9 0 1 1-2.12-9.36L23 10" })
					);
					const refreshButton = react.createElement("button", {
						type: "button",
						className: "dshq-refresh",
						"data-busy": busy ? "true" : undefined,
						"aria-label": "刷新额度",
						title: "点击刷新",
						disabled: busy,
						onClick: (e) => { e.stopPropagation(); refresh(); }
					}, refreshIcon);

					const rechargeButton = react.createElement("button", {
						type: "button",
						className: "dshq-recharge",
						"aria-label": "充值",
						title: "前往 DeepSeek 官方充值页充值",
						onClick: (e) => { e.stopPropagation(); openRecharge(d ? d.currency : "CNY"); }
					}, "充值");
					const actions = react.createElement("div", { className: "dshq-actions" }, rechargeButton, refreshButton);

					if (!wide) {
						if (!d) return null;
						return react.createElement("button", {
							type: "button",
							"data-dsh-quota-cell": true,
							"data-dsh-quota-wide": "false",
							"data-low": low ? "true" : undefined,
							title: fmtMoney(d.totalBalance, d.currency) + (s.error ? " · 更新失败，点击展开查看" : " · 点击展开侧边栏"),
							"aria-label": "DeepSeek 剩余额度 " + fmtMoney(d.totalBalance, d.currency),
							onClick: () => { if (layout) layout.toggleSidebar(); }
						}, react.createElement("span", null, low ? "!" : "¥"));
					}

					const head = react.createElement("div", { className: "dshq-head" },
						react.createElement("span", { className: "dshq-title" }, "DeepSeek 额度"),
						actions
					);
					let valueText, metaText, metaErr, captionText, captionErr;
					if (d) {
						valueText = fmtMoney(d.totalBalance, d.currency);
						metaText = "充值 " + fmtMoney(d.toppedUpBalance, d.currency) + " · 赠送 " + fmtMoney(d.grantedBalance, d.currency);
						captionText = "更新于 " + fmtTime(d.updatedAt) + (s.used > 0 ? " · 期间已用 " + fmtMoney(s.used, d.currency) : "");
						if (s.error) { captionErr = true; captionText = "更新失败 · " + s.error; }
					} else if (s.status === "error") {
						valueText = "—";
						metaText = s.error;
						metaErr = true;
						captionText = "点击右上角刷新重试";
					} else {
						valueText = "…";
						metaText = "加载中…";
						captionText = "";
					}

					return react.createElement("div", {
						"data-dsh-quota-cell": true,
						"data-dsh-quota-wide": "true",
						"data-low": low ? "true" : undefined,
						role: "group",
						"aria-label": "DeepSeek API 剩余额度",
						title: s.error ? s.error : "DeepSeek 官方余额接口，每 60 秒自动刷新"
					},
						head,
						react.createElement("div", { className: "dshq-value", "data-low": low ? "true" : undefined }, valueText),
						react.createElement("div", { className: "dshq-meta", "data-error": metaErr ? "true" : undefined }, metaText),
						react.createElement("div", { className: "dshq-caption", "data-error": captionErr ? "true" : undefined }, captionText)
					);
				}
			));

			slots.inject("shell.overlay", () => slots.register(
				{ name: "shell.overlay", id: "dsh-quota-recharge", order: 10, label: "DeepSeek 充值" },
				RechargePanel
			));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
