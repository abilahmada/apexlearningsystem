import fs from "node:fs/promises";
import path from "node:path";

const sourceFile = path.resolve(process.cwd(), "apex-curriculum-master.html");
const outputDir = path.resolve(process.cwd(), "data/curriculum");

function stripTags(html) {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPanel(html, panelId, nextPanelId) {
  const start = html.indexOf(`<div id="${panelId}"`);
  const end = html.indexOf(`<div id="${nextPanelId}"`);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`Cannot locate panel slice for ${panelId} -> ${nextPanelId}`);
  }
  return html.slice(start, end);
}

function parsePanelToCurriculum(panelHtml, gradeLevel, courseTitle) {
  const phaseHeaderRegex = /<h2>([\s\S]*?)<\/h2>/g;
  const phaseHeaders = [];
  let phaseMatch = phaseHeaderRegex.exec(panelHtml);
  while (phaseMatch) {
    const rawTitle = stripTags(phaseMatch[1]);
    if (!rawTitle) {
      phaseMatch = phaseHeaderRegex.exec(panelHtml);
      continue;
    }
    phaseHeaders.push({
      title: rawTitle,
      index: phaseMatch.index,
      headerLength: phaseMatch[0].length,
    });
    phaseMatch = phaseHeaderRegex.exec(panelHtml);
  }

  const phases = phaseHeaders.map((header, i) => {
    const bodyStart = header.index + header.headerLength;
    const bodyEnd = i + 1 < phaseHeaders.length ? phaseHeaders[i + 1].index : panelHtml.length;
    return {
      title: header.title,
      body: panelHtml.slice(bodyStart, bodyEnd),
    };
  });

  const modules = [];
  let sequence = 1;

  for (const phase of phases) {
    const cards = [];
    const cardStartRegex = /<div class="subj-card"/g;
    let cardStartMatch = cardStartRegex.exec(phase.body);
    while (cardStartMatch) {
      const start = cardStartMatch.index;
      const nextStartMatch = cardStartRegex.exec(phase.body);
      const end = nextStartMatch ? nextStartMatch.index : phase.body.length;
      cards.push(phase.body.slice(start, end));
      if (!nextStartMatch) break;
      cardStartRegex.lastIndex = nextStartMatch.index;
      cardStartMatch = cardStartRegex.exec(phase.body);
    }

    for (const card of cards) {
      const subjectMatch = card.match(/<div class="subj-name">([\s\S]*?)<\/div>/);
      const subjectName = stripTags(subjectMatch?.[1] ?? "Subjek");

      const lessons = parseRowsAsLessons(card);

      if (lessons.length > 0) {
        modules.push({
          title: `${phase.title} · ${subjectName}`,
          sequenceOrder: sequence,
          masteryThreshold: 80,
          meta: {
            phase: phase.title,
            subject: subjectName,
            gradeLevel,
          },
          lessons,
        });
        sequence += 1;
      }
    }

    const accRegex = /<div class="acc"[\s\S]*?<\/div>\s*<\/div>/g;
    let accMatch = accRegex.exec(phase.body);
    while (accMatch) {
      const accHtml = accMatch[0];
      const accTitleMatch = accHtml.match(/<div class="acc-h"[\s\S]*?<span>([\s\S]*?)<\/span>/);
      const accTitle = stripTags(accTitleMatch?.[1] ?? `${phase.title} Specialization`);
      const lessons = parseRowsAsLessons(accHtml);
      if (lessons.length > 0) {
        modules.push({
          title: `${phase.title} · ${accTitle}`,
          sequenceOrder: sequence,
          masteryThreshold: 80,
          meta: {
            phase: phase.title,
            subject: "Spesialisasi",
            track: accTitle,
            gradeLevel,
          },
          lessons,
        });
        sequence += 1;
      }
      accMatch = accRegex.exec(phase.body);
    }
  }

  return {
    version: "2026.04-full-extracted",
    source: "apex-curriculum-master.html",
    gradeLevel,
    locale: "id-ID",
    courses: [
      {
        title: courseTitle,
        description:
          "Ekstraksi otomatis dari dokumen master HTML. Setiap baris modul-topik dipetakan sebagai lesson.",
        modules,
      },
    ],
  };
}

function parseRowsAsLessons(sourceHtml) {
  const rowRegex = /<tr><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td>(?:<td>([\s\S]*?)<\/td>)?<\/tr>/g;
  const lessons = [];
  let rowMatch = rowRegex.exec(sourceHtml);
  while (rowMatch) {
    const code = stripTags(rowMatch[1]);
    const topic = stripTags(rowMatch[2]);
    const benchmark = stripTags(rowMatch[3] ?? "");
    const title = code ? `${code} — ${topic}` : topic;
    lessons.push({
      title,
      type: "ARTICLE",
      contentUrl: "",
      meta: {
        code: code || null,
        topic: topic || null,
        benchmark: benchmark || null,
      },
    });
    rowMatch = rowRegex.exec(sourceHtml);
  }
  return lessons;
}

async function run() {
  const html = await fs.readFile(sourceFile, "utf8");
  const sdPanel = extractPanel(html, "pnl-sd", "pnl-smp");
  const smpPanel = extractPanel(html, "pnl-smp", "pnl-smk");
  const smkPanel = extractPanel(html, "pnl-smk", "pnl-assessment");

  const sdPayload = parsePanelToCurriculum(sdPanel, "SD", "Kurikulum SD Master (Kelas 1-6)");
  const smpPayload = parsePanelToCurriculum(smpPanel, "SMP", "Kurikulum SMP Master (Kelas 7-9)");
  const smkPayload = parsePanelToCurriculum(
    smkPanel,
    "SMK",
    "Kurikulum SMK Master (Kelas 10-12)",
  );

  const allPayload = {
    version: "2026.04-full-extracted",
    source: "apex-curriculum-master.html",
    locale: "id-ID",
    tracks: [sdPayload, smpPayload, smkPayload],
  };

  const sdOut = path.join(outputDir, "sd-master-full.json");
  const smpOut = path.join(outputDir, "smp-master-full.json");
  const smkOut = path.join(outputDir, "smk-master-full.json");
  const allOut = path.join(outputDir, "curriculum-master-extracted.json");

  await fs.writeFile(sdOut, `${JSON.stringify(sdPayload, null, 2)}\n`, "utf8");
  await fs.writeFile(smpOut, `${JSON.stringify(smpPayload, null, 2)}\n`, "utf8");
  await fs.writeFile(smkOut, `${JSON.stringify(smkPayload, null, 2)}\n`, "utf8");
  await fs.writeFile(allOut, `${JSON.stringify(allPayload, null, 2)}\n`, "utf8");

  console.log(`Generated: ${path.relative(process.cwd(), sdOut)} (${sdPayload.courses[0].modules.length} modules)`);
  console.log(`Generated: ${path.relative(process.cwd(), smpOut)} (${smpPayload.courses[0].modules.length} modules)`);
  console.log(`Generated: ${path.relative(process.cwd(), smkOut)} (${smkPayload.courses[0].modules.length} modules)`);
  console.log(`Generated: ${path.relative(process.cwd(), allOut)}`);
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
