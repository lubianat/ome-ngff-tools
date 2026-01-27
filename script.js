const DEFAULT_TEST_FILES = [
    "docs/_data/_tests/2026-01-26-14-00-00.yml",
    "docs/_data/_tests/2026-01-26-16-00-00.yml",
    "docs/_data/_tests/2026-01-26-17-00-00.yml"
];

const VIEWERS_FILE = "docs/_data/viewers.yml";
const TEST_INDEX_FILE = "docs/_data/_tests/index.json";

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

function buildHeader(viewerOrder, viewerMap) {
    const headerRow = document.getElementById("feature-header-row");
    // Clear existing headers except first two (Feature, Sample Data)
    // But wait, index.html might have them already? 
    // Let's be safe and clear everything after the first two children.
    while (headerRow.children.length > 2) {
        headerRow.removeChild(headerRow.lastChild);
    }

    viewerOrder.forEach((viewerId) => {
        const viewer = viewerMap.get(viewerId) || { id: viewerId };
        const th = document.createElement("th");
        if (viewer.widercol) th.classList.add("wider");
        th.textContent = viewer.id;
        headerRow.appendChild(th);
    });
}

function buildRows(entries, viewerOrder, viewerMap) {
    const tbody = document.getElementById("feature-table-body");
    tbody.innerHTML = "";

    entries.forEach((entry) => {
        const feature = entry.feature || {};
        const tr = document.createElement("tr");

        // Feature Column
        const featureCell = document.createElement("td");
        featureCell.classList.add("feature");

        const name = feature.name || entry.slug;
        const featureName = document.createElement("span");
        featureName.classList.add("feature-name");
        featureName.textContent = name;
        featureCell.appendChild(featureName);

        if (feature.description) {
            const infoIcon = document.createElement("i");
            infoIcon.className = "fas fa-info-circle info-icon";
            infoIcon.title = feature.description;
            featureCell.appendChild(infoIcon);
        }
        tr.appendChild(featureCell);

        // Sample Data Column
        const sampleCell = document.createElement("td");
        sampleCell.classList.add("sample");

        if (feature.sample_url && feature.sample_name) {
            const link = document.createElement("a");
            link.href = feature.sample_url;
            link.target = "_blank";
            link.innerHTML = '<i class="far fa-file-alt"></i> ' + feature.sample_name;
            sampleCell.appendChild(link);
        } else if (feature.sample_name) {
            sampleCell.innerHTML = '<i class="far fa-file-alt"></i> ' + feature.sample_name;
        }

        if (feature.sample_html) {
            const htmlSpan = document.createElement("span");
            htmlSpan.innerHTML = " " + feature.sample_html;
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
    return loadYamlFile(VIEWERS_FILE);
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

        // Get all feature keys from this test
        const featureKeys = new Set([...Object.keys(features), ...Object.keys(results)]);

        featureKeys.forEach(slug => {
            if (!featureMap.has(slug)) {
                featureMap.set(slug, {
                    slug,
                    feature: features[slug] || { name: slug },
                    results: {}
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
