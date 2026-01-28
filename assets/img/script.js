const DEFAULT_TEST_FILES = [
    "data/_tests/2026-01-26-14-00-00.yml",
    "data/_tests/2026-01-26-16-00-00.yml",
    "data/_tests/2026-01-26-17-00-00.yml"
];

const VIEWERS_FILE = "data/viewers.yml";
const TEST_INDEX_FILE = "data/_tests/index.json";
const FEATURE_REF_FILE = "data/feature_ref.yml";
const TOOL_REF_FILE = "data/tool_ref.yml";
const FEATURES_NEW_FILE = "data/features_new.yml";
const TOOLS_INDEX_FILE = "data/tools/index.json";
const DEFAULT_TOOL_FILES = [
    "data/tools/napari.yml",
    "data/tools/avivator.yml",
    "data/tools/a-template.yml"
];

// Helper functions for boolean logic
function isTrue(val) {
    if (typeof val === 'string') {
        return val.toLowerCase() === 'yes' || val.toLowerCase() === 'true';
    }
    return val === true;
}

function isFalse(val) {
    if (typeof val === 'string') {
        return val.toLowerCase() === 'no' || val.toLowerCase() === 'false';
    }
    return val === false;
}

function logDebug(...args) {
    console.log("[app]", ...args);
}

function normalizeKey(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeInstructions(value) {
    if (!value) return "";
    if (Array.isArray(value)) {
        return value
            .map((item) => String(item || "").trim())
            .filter(Boolean)
            .join("\n");
    }
    return String(value).trim();
}

function buildFeatureRefIndex(featureRefRaw) {
    const index = new Map();
    if (!Array.isArray(featureRefRaw)) return index;
    featureRefRaw.forEach((entry) => {
        if (!entry || typeof entry !== "object") return;
        if (entry.slug) index.set(normalizeKey(entry.slug), entry);
        if (entry.name) index.set(normalizeKey(entry.name), entry);
    });
    return index;
}

function resolveFeatureRef(index, slug, name) {
    if (!index) return null;
    if (slug) {
        const match = index.get(normalizeKey(slug));
        if (match) return match;
    }
    if (name) {
        const match = index.get(normalizeKey(name));
        if (match) return match;
    }
    return null;
}

function buildToolRefIndex(toolRefRaw) {
    const index = new Map();
    if (!Array.isArray(toolRefRaw)) return index;
    toolRefRaw.forEach((item) => {
        if (!item || typeof item !== "object") return;
        if (item.id) {
            index.set(normalizeKey(item.id), item);
            return;
        }
        const keys = Object.keys(item);
        if (keys.length === 0) return;
        const key = keys[0];
        const val = item[key];
        if (val && typeof val === "object") {
            const id = val.id || key;
            const entry = Object.assign({ id }, val);
            index.set(normalizeKey(id), entry);
            index.set(normalizeKey(key), entry);
            return;
        }
        index.set(normalizeKey(key), { id: key });
    });
    return index;
}

function resolveToolInfo(index, viewerId) {
    if (!index || !viewerId) return null;
    return index.get(normalizeKey(viewerId)) || null;
}

function normalizeViewerList(viewerData) {
    const viewers = [];
    if (!Array.isArray(viewerData)) return viewers;
    viewerData.forEach((item) => {
        if (!item || typeof item !== "object") return;
        if (item.id) {
            viewers.push(item);
            return;
        }
        const keys = Object.keys(item);
        if (keys.length === 0) return;
        const key = keys[0];
        const value = item[key];
        if (value && typeof value === "object") {
            viewers.push(Object.assign({ id: value.id || key }, value));
        } else {
            viewers.push({ id: key });
        }
    });
    return viewers;
}

function normalizeTestWrapper(rawTest) {
    if (!rawTest) return null;
    if (rawTest.feature_test) return rawTest.feature_test;
    if (Array.isArray(rawTest)) {
        for (const item of rawTest) {
            if (item && item.feature_test) return item.feature_test;
        }
    }
    return rawTest;
}

function normalizeResults(resultsRaw, features) {
    if (!resultsRaw) return {};
    let resultsObj = {};

    if (Array.isArray(resultsRaw)) {
        let currentFeature = null;
        resultsRaw.forEach((entry) => {
            if (!entry || typeof entry !== "object") return;
            if (entry.feature) {
                currentFeature = entry.feature;
                if (!resultsObj[currentFeature]) resultsObj[currentFeature] = {};
            }
            if (entry.tools && currentFeature) {
                resultsObj[currentFeature] = entry.tools;
            }
            if (entry.tool && entry.features) {
                const toolId = entry.tool;
                Object.entries(entry.features).forEach(([featureSlug, featureResult]) => {
                    if (!resultsObj[featureSlug]) resultsObj[featureSlug] = {};
                    resultsObj[featureSlug][toolId] = featureResult;
                });
            }
        });
        return resultsObj;
    }

    if (typeof resultsRaw !== "object") return {};

    const featureKeys = new Set(Object.keys(features || {}));
    const resultsKeys = Object.keys(resultsRaw);
    const looksLikeFeatureMap = resultsKeys.some((key) => featureKeys.has(key));

    if (looksLikeFeatureMap) {
        return resultsRaw;
    }

    resultsKeys.forEach((toolId) => {
        const toolResults = resultsRaw[toolId];
        if (!toolResults || typeof toolResults !== "object") return;
        Object.entries(toolResults).forEach(([featureSlug, featureResult]) => {
            if (!resultsObj[featureSlug]) resultsObj[featureSlug] = {};
            resultsObj[featureSlug][toolId] = featureResult;
        });
    });

    return resultsObj;
}

const RESULT_KEYS = new Set([
    "supported",
    "opens",
    "notes",
    "issue_url",
    "viewer_url",
    "viewer_url_postfix"
]);

function extractResultFields(source) {
    const result = {};
    if (!source || typeof source !== "object") return result;
    RESULT_KEYS.forEach((key) => {
        if (key in source) result[key] = source[key];
    });
    return result;
}

function normalizeFeatureResultsBlock(block) {
    if (!block) return {};
    if (Array.isArray(block)) {
        const mapped = {};
        block.forEach((item) => {
            if (!item || typeof item !== "object") return;
            if (item.feature) {
                const slug = item.feature;
                const clone = Object.assign({}, item);
                delete clone.feature;
                mapped[slug] = clone;
            }
        });
        return mapped;
    }

    if (typeof block !== "object") return {};

    const keys = Object.keys(block);
    const hasResultKeys = keys.some((key) => RESULT_KEYS.has(key));
    const featureKeys = keys.filter((key) => !RESULT_KEYS.has(key));

    if (hasResultKeys && featureKeys.length === 1) {
        const candidate = block[featureKeys[0]];
        if (!candidate || typeof candidate !== "object" || Object.keys(candidate).length === 0) {
            return { [featureKeys[0]]: extractResultFields(block) };
        }
    }

    const normalized = {};
    featureKeys.forEach((featureSlug) => {
        const value = block[featureSlug];
        if (value && typeof value === "object") {
            normalized[featureSlug] = value;
        } else {
            normalized[featureSlug] = {};
        }
    });
    return normalized;
}

function parseTestNumber(testId) {
    if (!testId) return -1;
    const match = String(testId).match(/(\d+)/);
    if (!match) return -1;
    return Number(match[1]);
}

function mergeVersionEntries(entries) {
    if (!entries) return {};
    if (Array.isArray(entries)) {
        return entries.reduce((acc, item) => {
            if (item && typeof item === "object") {
                Object.assign(acc, item);
            }
            return acc;
        }, {});
    }
    if (typeof entries === "object") return entries;
    return {};
}

function createFeatureEntry(base, overrides) {
    const slug = overrides.slug || base.slug;
    const aliasList = [];
    if (Array.isArray(overrides.aliases)) {
        aliasList.push(...overrides.aliases);
    } else if (typeof overrides.aliases === "string") {
        aliasList.push(overrides.aliases);
    }
    const matchSlugs = new Set([base.slug, overrides.slug, ...aliasList].filter(Boolean));
    const feature = {
        slug,
        name: overrides.name || base.name || slug,
        description: overrides.description || base.description || null,
        sample_url: overrides.sample_url || base.sample_url || null,
        sample_name: overrides.sample_name || base.sample_name || null,
        sample_html: overrides.sample_html || base.sample_html || null
    };
    return {
        slug,
        matchSlugs: Array.from(matchSlugs),
        feature
    };
}

function addFeatureToVersion(versionBucket, entry) {
    if (!versionBucket || !entry) return;
    const primaryKey = normalizeKey(entry.slug);
    if (versionBucket.aliasMap.has(primaryKey)) return;
    versionBucket.features.push(entry);
    entry.matchSlugs.forEach((slug) => {
        const key = normalizeKey(slug);
        if (!versionBucket.aliasMap.has(key)) {
            versionBucket.aliasMap.set(key, entry);
        }
    });
}

function buildVersionFeatureMap(featureList) {
    const versionSet = new Set();
    const versionMap = new Map();
    const globalFeatures = [];

    if (!Array.isArray(featureList)) {
        return { versionOrder: [], versionMap };
    }

    featureList.forEach((feature) => {
        if (!feature || typeof feature !== "object") return;
        const versions = feature.versions;
        if (versions && typeof versions === "object") {
            Object.keys(versions).forEach((versionKey) => {
                versionSet.add(String(versionKey));
            });
        }
    });

    const versionOrder = Array.from(versionSet).sort((a, b) => {
        const aNum = Number.parseFloat(a);
        const bNum = Number.parseFloat(b);
        if (Number.isNaN(aNum) || Number.isNaN(bNum)) {
            return b.localeCompare(a);
        }
        return bNum - aNum;
    });

    versionOrder.forEach((version) => {
        versionMap.set(version, { version, features: [], aliasMap: new Map() });
    });

    featureList.forEach((feature) => {
        if (!feature || typeof feature !== "object") return;
        const base = {
            slug: feature.slug || "",
            name: feature.name || feature.slug || "Unnamed feature",
            description: feature.description || null,
            sample_url: feature.sample_url || null,
            sample_name: feature.sample_name || null,
            sample_html: feature.sample_html || null
        };
        const versions = feature.versions;
        if (!versions || typeof versions !== "object" || Object.keys(versions).length === 0) {
            if (base.slug) {
                globalFeatures.push(base);
            }
            return;
        }
        Object.entries(versions).forEach(([versionKey, versionEntries]) => {
            const version = String(versionKey);
            const versionData = mergeVersionEntries(versionEntries);
            const entry = createFeatureEntry(base, versionData);
            const bucket = versionMap.get(version);
            if (bucket) {
                addFeatureToVersion(bucket, entry);
            }
        });
    });

    if (globalFeatures.length > 0) {
        versionMap.forEach((bucket) => {
            globalFeatures.forEach((base) => {
                const entry = createFeatureEntry(base, {});
                addFeatureToVersion(bucket, entry);
            });
        });
    }

    versionMap.forEach((bucket) => {
        bucket.features.sort((a, b) => {
            const aName = (a.feature && a.feature.name) || a.slug;
            const bName = (b.feature && b.feature.name) || b.slug;
            return aName.localeCompare(bName);
        });
    });

    return { versionOrder, versionMap };
}

async function loadToolList() {
    try {
        const response = await fetch(TOOLS_INDEX_FILE, { cache: "no-store" });
        if (response.ok) {
            const payload = await response.json();
            if (Array.isArray(payload) && payload.length > 0) {
                return payload;
            }
            if (payload && Array.isArray(payload.tools) && payload.tools.length > 0) {
                return payload.tools;
            }
        }
    } catch (error) {
        console.warn("Tools index not available", error);
    }
    return DEFAULT_TOOL_FILES;
}

async function loadToolFiles(toolFiles) {
    const entries = [];
    for (const file of toolFiles) {
        try {
            const raw = await loadYamlFile(file);
            entries.push({ filePath: file, raw });
        } catch (error) {
            console.warn("Failed to load tool file", file, error);
        }
    }
    return entries;
}

function deriveToolId(toolInfo, filePath) {
    if (toolInfo && toolInfo.id) return toolInfo.id;
    if (toolInfo && toolInfo.name) return toolInfo.name;
    if (filePath) {
        const fileName = filePath.split("/").pop();
        if (fileName) {
            return fileName.replace(/\.ya?ml$/i, "");
        }
    }
    return null;
}

function parseToolFile(raw, filePath) {
    if (!raw) return null;
    let toolInfo = null;
    let testInfo = null;

    if (raw.tool_info || raw.test_info) {
        toolInfo = raw.tool_info || {};
        testInfo = raw.test_info || {};
    } else if (Array.isArray(raw)) {
        const normalized = normalizeViewerList(raw);
        if (normalized.length > 0) {
            toolInfo = normalized[0];
        }
    } else if (typeof raw === "object") {
        toolInfo = raw;
    }

    const derivedId = deriveToolId(toolInfo, filePath);
    if (!toolInfo) {
        toolInfo = derivedId ? { id: derivedId, name: derivedId } : {};
    }
    if (derivedId && !toolInfo.id) {
        toolInfo.id = derivedId;
    }

    return { toolInfo, testInfo, filePath };
}

function mergeToolInfo(primary, fallback) {
    const merged = Object.assign({}, fallback || {}, primary || {});
    if (!merged.id) merged.id = (primary && primary.id) || (fallback && fallback.id) || null;
    if (!merged.name) merged.name = merged.id || null;
    return merged;
}

function ensureVersionToolMap(resultsByVersion, version, toolId) {
    if (!resultsByVersion.has(version)) {
        resultsByVersion.set(version, new Map());
    }
    const versionMap = resultsByVersion.get(version);
    if (!versionMap.has(toolId)) {
        versionMap.set(toolId, new Map());
    }
    return versionMap.get(toolId);
}

function buildToolOrder(viewerList, toolInfoById) {
    const order = [];
    const seen = new Set();
    const toolIds = Array.from(toolInfoById.keys());
    const toolIdByKey = new Map();
    toolIds.forEach((toolId) => {
        toolIdByKey.set(normalizeKey(toolId), toolId);
    });

    viewerList.forEach((viewer) => {
        if (!viewer || !viewer.id) return;
        const match = toolIdByKey.get(normalizeKey(viewer.id));
        if (match && !seen.has(match)) {
            order.push(match);
            seen.add(match);
        }
    });

    const extras = toolIds.filter((toolId) => !seen.has(toolId));
    extras.sort((a, b) => {
        const aName = (toolInfoById.get(a) || {}).name || a;
        const bName = (toolInfoById.get(b) || {}).name || b;
        return aName.localeCompare(bName);
    });

    return order.concat(extras);
}

function buildEntriesForVersion(versionData, toolOrder, toolInfoById, versionResults) {
    const entries = [];
    const resultsForVersion = versionResults || new Map();

    versionData.features.forEach((featureEntry) => {
        const entryResults = {};
        const entryToolMeta = {};

        toolOrder.forEach((toolId) => {
            const toolInfo = toolInfoById.get(toolId) || { id: toolId };
            const toolResults = resultsForVersion.get(toolId);
            const cell = toolResults ? toolResults.get(featureEntry.slug) : null;
            if (cell && cell.result) {
                entryResults[toolId] = cell.result;
            }
            entryToolMeta[toolId] = {
                tool: toolInfo,
                test: cell ? cell.testMeta : null,
                feature: { slug: featureEntry.slug, version: versionData.version }
            };
        });

        entries.push({
            slug: featureEntry.slug,
            feature: featureEntry.feature,
            results: entryResults,
            toolMeta: entryToolMeta
        });
    });

    return entries;
}

function createVersionSection(versionData, toolCount) {
    const section = document.createElement("section");
    section.className = "version-section";
    section.id = `version-${String(versionData.version).replace(/\./g, "-")}`;

    const header = document.createElement("div");
    header.className = "version-header";

    const titleWrap = document.createElement("div");
    titleWrap.className = "version-title";

    const pill = document.createElement("div");
    pill.className = "version-pill";
    pill.textContent = `OME-Zarr ${versionData.version}`;

    const heading = document.createElement("h2");
    heading.textContent = `OME-Zarr ${versionData.version}`;

    titleWrap.appendChild(pill);
    titleWrap.appendChild(heading);

    const meta = document.createElement("div");
    meta.className = "version-meta";
    meta.textContent = `${versionData.features.length} features \u2022 ${toolCount} tools`;

    header.appendChild(titleWrap);
    header.appendChild(meta);

    const tableWrap = document.createElement("div");
    tableWrap.className = "table-wrap";

    const table = document.createElement("table");
    table.className = "matrix-table";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    headerRow.className = "matrix-header-row";

    const featureTh = document.createElement("th");
    featureTh.className = "feature";
    featureTh.textContent = "Feature";

    const sampleTh = document.createElement("th");
    sampleTh.className = "sample";
    sampleTh.textContent = "Sample data";

    headerRow.appendChild(featureTh);
    headerRow.appendChild(sampleTh);
    thead.appendChild(headerRow);

    const tbody = document.createElement("tbody");
    tbody.className = "matrix-body";

    table.appendChild(thead);
    table.appendChild(tbody);
    tableWrap.appendChild(table);

    section.appendChild(header);
    section.appendChild(tableWrap);

    return section;
}

function populateVersionLinks(versionOrder) {
    const container = document.getElementById("version-links");
    if (!container) return;
    container.innerHTML = "";
    versionOrder.forEach((version) => {
        const link = document.createElement("a");
        link.href = `#version-${String(version).replace(/\./g, "-")}`;
        link.className = "chip-link";
        link.textContent = `OME-Zarr ${version}`;
        container.appendChild(link);
    });
}

function updateStat(id, value) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = value;
    }
}

async function initVersionMatrix() {
    const status = document.getElementById("status");
    const container = document.getElementById("version-sections");
    if (!status || !container) return;

    status.textContent = "Loading versioned feature matrix...";

    try {
        const featureList = await loadYamlFile(FEATURES_NEW_FILE);

        const { versionOrder, versionMap } = buildVersionFeatureMap(featureList);

        const toolFiles = await loadToolList();
        const toolFileData = await loadToolFiles(toolFiles);

        const toolInfoById = new Map();
        const toolInfoIndex = new Map();
        const resultsByVersion = new Map();
        const toolOrder = [];
        const toolOrderSeen = new Set();

        toolFileData.forEach((toolFile) => {
            const parsed = parseToolFile(toolFile.raw, toolFile.filePath);
            if (!parsed) return;

            const derivedId = deriveToolId(parsed.toolInfo, toolFile.filePath);
            const mergedInfo = mergeToolInfo(parsed.toolInfo, null);
            const toolId = mergedInfo.id || derivedId;
            if (!toolId) return;

            mergedInfo.id = toolId;
            toolInfoById.set(toolId, mergedInfo);
            toolInfoIndex.set(normalizeKey(toolId), mergedInfo);
            if (!toolOrderSeen.has(toolId)) {
                toolOrder.push(toolId);
                toolOrderSeen.add(toolId);
            }

            const testInfo = parsed.testInfo || {};
            Object.entries(testInfo).forEach(([testId, testData]) => {
                if (!testData || typeof testData !== "object") return;
                const testNumber = parseTestNumber(testId);
                const versionBlocks = testData.features || {};

                Object.entries(versionBlocks).forEach(([versionKey, versionBlock]) => {
                    const version = String(versionKey);
                    const versionData = versionMap.get(version);
                    if (!versionData) return;

                    const normalizedBlock = normalizeFeatureResultsBlock(versionBlock);
                    Object.entries(normalizedBlock).forEach(([featureSlug, result]) => {
                        const featureEntry = versionData.aliasMap.get(normalizeKey(featureSlug));
                        if (!featureEntry) return;

                        const versionResults = ensureVersionToolMap(resultsByVersion, version, toolId);
                        const existing = versionResults.get(featureEntry.slug);
                        if (!existing || testNumber > existing.testNumber) {
                            versionResults.set(featureEntry.slug, {
                                result: result && typeof result === "object" ? result : {},
                                testNumber,
                                testMeta: {
                                    id: testId,
                                    number: testNumber,
                                    tool_version: testData.tool_version || null,
                                    additional_versions: testData.additional_versions || null,
                                    notes: testData.notes || null,
                                    source_file: toolFile.filePath || null
                                }
                            });
                        }
                    });
                });
            });
        });

        const extras = Array.from(toolInfoById.keys()).filter((toolId) => !toolOrderSeen.has(toolId));
        extras.sort((a, b) => {
            const aName = (toolInfoById.get(a) || {}).name || a;
            const bName = (toolInfoById.get(b) || {}).name || b;
            return aName.localeCompare(bName);
        });
        toolOrder.push(...extras);
        const viewerMap = new Map();
        toolOrder.forEach((toolId) => {
            const info = toolInfoById.get(toolId) || { id: toolId };
            viewerMap.set(toolId, info);
        });

        populateVersionLinks(versionOrder);

        container.innerHTML = "";
        const emptyFeatureIndex = new Map();
        const uniqueFeatures = new Set();

        versionOrder.forEach((version, index) => {
            const versionData = versionMap.get(version);
            if (!versionData) return;
            versionData.features.forEach((feature) => {
                uniqueFeatures.add(normalizeKey(feature.slug));
            });
            const section = createVersionSection(versionData, toolOrder.length);
            if (index > 0) {
                section.style.animationDelay = `${index * 0.08}s`;
            }
            container.appendChild(section);

            const headerRow = section.querySelector(".matrix-header-row");
            const tbody = section.querySelector(".matrix-body");
            buildHeader(toolOrder, viewerMap, toolInfoIndex, headerRow);

            const entries = buildEntriesForVersion(
                versionData,
                toolOrder,
                toolInfoById,
                resultsByVersion.get(version)
            );
            buildRows(entries, toolOrder, viewerMap, emptyFeatureIndex, tbody);
        });

        updateStat("stat-versions", versionOrder.length);
        updateStat("stat-tools", toolOrder.length);
        updateStat("stat-features", uniqueFeatures.size);

        status.textContent = `Loaded ${versionOrder.length} version tables from ${toolOrder.length} tools.`;
    } catch (error) {
        console.error(error);
        status.textContent = "Failed to load versioned matrix. Check console for details.";
    }
}

function buildHeader(viewerOrder, viewerMap, toolRefIndex, headerRowOverride) {
    const headerRow = headerRowOverride || document.getElementById("feature-header-row");
    // Clear existing headers except first two (Feature, Sample Data)
    while (headerRow.children.length > 2) {
        headerRow.removeChild(headerRow.lastChild);
    }

    viewerOrder.forEach((viewerId) => {
        const viewer = viewerMap.get(viewerId) || { id: viewerId };
        const th = document.createElement("th");
        if (viewer.widercol) th.classList.add("wider");

        let label = viewer.label || viewer.name || viewer.id;
        th.textContent = label;

        const toolInfo = resolveToolInfo(toolRefIndex, viewer.id);
        const viewerInstructions = normalizeInstructions(viewer.test_instructions);
        const toolInstructions = toolInfo ? normalizeInstructions(toolInfo.test_instructions) : "";
        const instructions = viewerInstructions || toolInstructions;
        if (instructions) {
            const infoIcon = document.createElement("i");
            infoIcon.className = "fas fa-question-circle info-icon header-icon";
            infoIcon.title = "How to test:\n" + instructions;
            th.appendChild(infoIcon);
        }

        headerRow.appendChild(th);
    });
}

function buildRows(entries, viewerOrder, viewerMap, featureRefIndex, tbodyOverride) {
    const tbody = tbodyOverride || document.getElementById("feature-table-body");
    const tooltip = ensureHoverTooltip();
    tbody.innerHTML = "";

    entries.forEach((entry) => {
        const feature = entry.feature || {};
        const ref = resolveFeatureRef(featureRefIndex, entry.slug, feature.name);
        const mergedFeature = Object.assign({}, ref || {}, feature || {});
        const tr = document.createElement("tr");

        // Feature Column
        const featureCell = document.createElement("td");
        featureCell.classList.add("feature");

        const featureLabel = document.createElement("div");
        featureLabel.classList.add("feature-label");

        const name = mergedFeature.name || entry.slug;
        const featureName = document.createElement("span");
        featureName.classList.add("feature-name");
        featureName.textContent = name;
        featureLabel.appendChild(featureName);

        const description = mergedFeature.description;
        const featureInstructions = normalizeInstructions(
            mergedFeature.how_to_test || mergedFeature.test_instructions
        );
        if (description || featureInstructions) {
            const infoIcon = document.createElement("i");
            infoIcon.className = "fas fa-info-circle info-icon";
            const tooltipParts = [];
            if (description) tooltipParts.push(description);
            if (featureInstructions) tooltipParts.push("How to test:\n" + featureInstructions);
            infoIcon.title = tooltipParts.join("\n\n");
            featureLabel.appendChild(infoIcon);
        }
        featureCell.appendChild(featureLabel);
        tr.appendChild(featureCell);

        // Sample Data Column
        const sampleCell = document.createElement("td");
        sampleCell.classList.add("sample");

        if (mergedFeature.sample_url && mergedFeature.sample_name) {
            const link = document.createElement("a");
            link.href = mergedFeature.sample_url;
            link.target = "_blank";
            link.innerHTML = '<i class="far fa-file-alt"></i> ' + mergedFeature.sample_name;
            sampleCell.appendChild(link);
        } else if (mergedFeature.sample_name) {
            sampleCell.innerHTML = '<i class="far fa-file-alt"></i> ' + mergedFeature.sample_name;
        }

        if (mergedFeature.sample_html) {
            const htmlSpan = document.createElement("span");
            htmlSpan.innerHTML = " " + mergedFeature.sample_html;
            sampleCell.appendChild(htmlSpan);
        }
        tr.appendChild(sampleCell);

        // Viewer Columns
        viewerOrder.forEach((viewerId) => {
            const viewer = viewerMap.get(viewerId) || { id: viewerId };
            const result = entry.results ? entry.results[viewerId] : null;
            let cellClass = "missing";

            if (result && typeof result === "object") {
                const supported = result.supported;
                const opens = result.opens;

                if (isTrue(supported)) {
                    cellClass = "supported";
                } else if (isFalse(opens)) {
                    cellClass = "fails";
                } else if (isTrue(opens)) {
                    cellClass = "ignored";
                }
            }

            const cell = document.createElement("td");
            cell.classList.add(cellClass);

            const iconRow = document.createElement("div");
            iconRow.className = "icon-row";

            const viewerUrl = result && result.viewer_url ? result.viewer_url : null;
            const resolvedUrl = viewerUrl || (viewer.viewer_url && feature.sample_url
                ? viewer.viewer_url + feature.sample_url + (viewer.viewer_url_postfix || "")
                : null);

            if (resolvedUrl) {
                const eyeLink = document.createElement("a");
                eyeLink.href = resolvedUrl;
                eyeLink.target = "_blank";
                eyeLink.rel = "noopener";
                eyeLink.className = "icon-btn";
                eyeLink.title = "Open in viewer";
                eyeLink.innerHTML = '<i class="fas fa-eye"></i>';
                iconRow.appendChild(eyeLink);
            }

            if (result && result.issue_url) {
                const ghLink = document.createElement("a");
                ghLink.href = result.issue_url;
                ghLink.target = "_blank";
                ghLink.rel = "noopener";
                ghLink.className = "icon-btn";
                ghLink.title = "View Issue";
                ghLink.innerHTML = '<i class="fab fa-github"></i>';
                iconRow.appendChild(ghLink);
            }

            if (result && result.notes) {
                const notesSpan = document.createElement("span");
                notesSpan.className = "icon-btn";
                notesSpan.title = result.notes;
                notesSpan.innerHTML = '<i class="fas fa-info-circle"></i>';
                iconRow.appendChild(notesSpan);
            }

            cell.appendChild(iconRow);
            tr.appendChild(cell);

            const cellMeta = entry.toolMeta ? entry.toolMeta[viewerId] : null;
            const testMeta = cellMeta && cellMeta.test ? cellMeta.test : null;
            const hasMeta = Boolean(
                testMeta && (testMeta.tool_version || testMeta.additional_versions || testMeta.notes)
            );
            if (hasMeta) {
                const infoPayload = { id: viewer.id };
                if (testMeta.tool_version) infoPayload.version = testMeta.tool_version;
                if (testMeta.additional_versions) infoPayload.additional_versions = testMeta.additional_versions;
                if (testMeta.notes) infoPayload.notes = testMeta.notes;
                const formatted = JSON.stringify(infoPayload, null, 2);

                const infoIcon = document.createElement("span");
                infoIcon.className = "cell-info-icon";
                infoIcon.setAttribute("aria-label", "Show tool version details");
                infoIcon.innerHTML = '<i class="fas fa-question-circle"></i>';
                iconRow.appendChild(infoIcon);

                infoIcon.addEventListener("mouseenter", (event) => {
                    updateHoverTooltip(tooltip, formatted);
                    positionHoverTooltip(tooltip, event.clientX, event.clientY);
                    tooltip.classList.add("visible");
                });
                infoIcon.addEventListener("mousemove", (event) => {
                    positionHoverTooltip(tooltip, event.clientX, event.clientY);
                });
                infoIcon.addEventListener("mouseleave", () => {
                    tooltip.classList.remove("visible");
                });
            }
        });

        tbody.appendChild(tr);
    });
}

async function loadYamlFile(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
        throw new Error("Failed to load " + path + ": " + response.statusText);
    }
    const text = await response.text();
    return jsyaml.load(text);
}

async function loadViewers() {
    try {
        return await loadYamlFile(VIEWERS_FILE);
    } catch (e) {
        console.warn("Viewers file not available, falling back to tool data", e);
    }
    try {
        const toolFiles = await loadToolList();
        const toolFileData = await loadToolFiles(toolFiles);
        return toolFileData
            .map((toolFile) => {
                const parsed = parseToolFile(toolFile.raw, toolFile.filePath);
                return parsed ? parsed.toolInfo : null;
            })
            .filter(Boolean);
    } catch (e) {
        console.warn("Tool fallback not available", e);
        return [];
    }
}

async function loadFeatureRef() {
    try {
        return await loadYamlFile(FEATURE_REF_FILE);
    } catch (e) {
        console.warn("Feature ref not available", e);
        return [];
    }
}

async function loadToolRef() {
    try {
        return await loadYamlFile(TOOL_REF_FILE);
    } catch (e) {
        console.warn("Tool ref not available", e);
        return [];
    }
}

async function loadTests() {
    try {
        const response = await fetch(TEST_INDEX_FILE, { cache: "no-store" });
        if (response.ok) {
            const list = await response.json();
            if (Array.isArray(list) && list.length > 0) {
                return list;
            }
        }
    } catch (error) {
        console.error("Test index not available", error);
    }
    return DEFAULT_TEST_FILES;
}

function parseDateInfo(dateRaw, fileName) {
    let dayStamp = null;
    if (dateRaw) {
        const parsed = new Date(dateRaw);
        if (!Number.isNaN(parsed.getTime())) {
            dayStamp = Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
        } else if (/^\d{2}-\d{2}-\d{2}$/.test(dateRaw)) {
            const parts = dateRaw.split("-").map(Number);
            dayStamp = Date.UTC(2000 + parts[0], parts[1] - 1, parts[2]);
        }
    }
    if (dayStamp === null && fileName) {
        const match = fileName.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
            const year = Number(match[1]);
            const month = Number(match[2]) - 1;
            const day = Number(match[3]);
            dayStamp = Date.UTC(year, month, day);
        }
    }
    return {
        dayStamp: dayStamp === null ? 0 : dayStamp,
        dateRaw: dateRaw || null
    };
}

function aggregateTestResults(testData) {
    // 1. Sort testData by date (newest first)
    const sortedTests = testData.map(item => {
        const testWrapper = normalizeTestWrapper(item.raw);
        const dateInfo = parseDateInfo(testWrapper ? testWrapper.date : null, item.fileName);
        return { ...item, dayStamp: dateInfo.dayStamp, testWrapper };
    }).sort((a, b) => b.dayStamp - a.dayStamp); // Descending order

    const featureMap = new Map();

    sortedTests.forEach(testItem => {
        const testWrapper = testItem.testWrapper;
        if (!testWrapper) return;

        const features = testWrapper.features || {};
        const results = normalizeResults(testWrapper.results, features);
        const tools = testWrapper.tools || {};

        // Get all feature keys from this test
        const featureKeys = new Set([...Object.keys(features), ...Object.keys(results)]);

        featureKeys.forEach(slug => {
            if (!featureMap.has(slug)) {
                featureMap.set(slug, {
                    slug,
                    feature: features[slug] || { name: slug },
                    results: {},
                    toolMeta: {}
                });
            }

            const aggregatedEntry = featureMap.get(slug);

            // Update feature info if not present (or maybe overwrite with newest?)
            // Let's assume newest feature info is best, but usually it's static.
            if (!aggregatedEntry.feature.description && features[slug] && features[slug].description) {
                aggregatedEntry.feature = features[slug];
            }

            const testResults = results[slug] || {};

            Object.keys(testResults).forEach(toolId => {
                // Only set if not already set (since we iterate newest to oldest)
                if (!aggregatedEntry.results[toolId]) {
                    aggregatedEntry.results[toolId] = testResults[toolId];
                    if (!aggregatedEntry.toolMeta[toolId]) {
                        const toolData = tools[toolId];
                        const toolInfo = toolData && typeof toolData === "object"
                            ? Object.assign({ id: toolId }, toolData)
                            : { id: toolId };
                        aggregatedEntry.toolMeta[toolId] = {
                            tool: toolInfo,
                            test: {
                                file: testItem.fileName || null,
                                date: testWrapper.date || null,
                                author: testWrapper.author || null,
                                notes: testWrapper.notes || null
                            }
                        };
                    }
                }
            });
        });
    });

    return Array.from(featureMap.values()).sort((a, b) => {
        const aName = (a.feature && a.feature.name) || a.slug;
        const bName = (b.feature && b.feature.name) || b.slug;
        return aName.localeCompare(bName);
    });
}

function ensureHoverTooltip() {
    let tooltip = document.getElementById("hover-tooltip");
    if (!tooltip) {
        tooltip = document.createElement("div");
        tooltip.id = "hover-tooltip";
        tooltip.className = "hover-tooltip";
        const pre = document.createElement("pre");
        pre.className = "hover-tooltip-content";
        tooltip.appendChild(pre);
        document.body.appendChild(tooltip);
    }
    return tooltip;
}

function updateHoverTooltip(tooltip, text) {
    const pre = tooltip.querySelector(".hover-tooltip-content");
    if (pre) {
        pre.textContent = text;
    }
}

function positionHoverTooltip(tooltip, clientX, clientY) {
    const padding = 12;
    const offset = 14;
    tooltip.style.left = `${clientX + offset}px`;
    tooltip.style.top = `${clientY + offset}px`;

    const rect = tooltip.getBoundingClientRect();
    let left = clientX + offset;
    let top = clientY + offset;

    if (left + rect.width + padding > window.innerWidth) {
        left = clientX - rect.width - offset;
    }
    if (top + rect.height + padding > window.innerHeight) {
        top = clientY - rect.height - offset;
    }

    tooltip.style.left = `${Math.max(padding, left)}px`;
    tooltip.style.top = `${Math.max(padding, top)}px`;
}
