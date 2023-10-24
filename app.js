import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";

// Function to process tasks in batches
async function processInBatches(tasks, batchSize) {
  let i = 0;
  const results = [];
  while (i < tasks.length) {
    const batch = tasks.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch);
    results.push(...batchResults);
    i += batchSize;
  }
  return results;
}

// Function to split video
async function splitVideo(videoFilePath, outputDir, NP) {
  const videoDuration = await getVideoDuration(videoFilePath);
  const numberOfClips = Math.ceil(videoDuration / 60);

  const tasks = Array.from({ length: numberOfClips }, async (_, i) => {
    const outputFilePath = path.join(outputDir, `clip_${i + 1}.mp4`);
    await saveSegment(videoFilePath, i * 60, 60, outputFilePath);

    // Display progress
    console.log(`Processed video segment: ${i + 1}/${numberOfClips}`);
    return outputFilePath;
  });

  const outputFilePaths = await processInBatches(tasks, NP);

  return outputFilePaths;
}

async function getVideoDuration(videoFilePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoFilePath, (err, metadata) => {
      if (err) reject(err);
      resolve(metadata.format.duration);
    });
  });
}

function saveSegment(inputFilePath, start, duration, outputFilePath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputFilePath)
      .seekInput(start)
      .duration(duration)
      .on("end", resolve)
      .on("error", reject)
      .save(outputFilePath);
  });
}

// Parse SRT data
function parseSRT(data) {
  const blocks = data.split("\n\n");
  return blocks
    .map((block) => {
      const lines = block.split("\n");
      const [start, end] = lines[1]?.split(" --> ") || [];
      const text = lines.slice(2).join(" ");
      return { start, end, text };
    })
    .filter((item) => item.start && item.end && item.text);
}

function splitByTime(items, timeInSecs) {
  let segments = [];
  let start = items[0].start;

  for (let i = 0; i < items.length; i++) {
    if (timeDiffInSeconds(start, items[i].end) > timeInSecs) {
      segments.push({ start, end: items[i].end });
      start = items[i].end;
    }

    if (i === items.length - 1) {
      segments.push({ start, end: items[i].end });
    }
  }

  return segments;
}

function timeDiffInSeconds(start, end) {
  const parseTime = (time) => {
    const [h, m, s] = time.split(":");
    const [sec, ms] = s.split(",");
    return (
      parseFloat(h) * 3600 +
      parseFloat(m) * 60 +
      parseFloat(sec) +
      parseFloat(ms) / 1000
    );
  };

  return parseTime(end) - parseTime(start);
}
function splitSubtitles(data, outputDir) {
  const items = parseSRT(data);
  const segments = splitByTime(items, 60);
  const segmentFiles = [];

  segments.forEach((segment, index) => {
    const segmentSubtitles = items.filter(
      (item) =>
        timeDiffInSeconds(segment.start, item.start) >= 0 &&
        timeDiffInSeconds(segment.end, item.end) <= 0
    );

    if (segmentSubtitles.length) {
      const srtContent = segmentSubtitles
        .map(
          (subtitle, subIndex) =>
            `${subIndex + 1}\n${subtitle.start} --> ${subtitle.end}\n${
              subtitle.text
            }`
        )
        .join("\n\n");

      const segmentFilePath = path.join(
        outputDir,
        `subtitle_segment_${index + 1}.srt`
      );
      fs.writeFileSync(segmentFilePath, srtContent);
      segmentFiles.push(segmentFilePath);

      // Display progress
      console.log(
        `Processed subtitle segment: ${index + 1}/${segments.length}`
      );
    }
  });

  return segmentFiles;
}

// Run functions
(async () => {
  const VIDEO_FILE_PATH = "video.mp4";
  const SUBTITLE_FILE_PATH = "subtitle.srt";
  const OUTPUT_DIR = "output";

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
  }

  await splitVideo(VIDEO_FILE_PATH, OUTPUT_DIR, 8);
  const subtitleData = fs.readFileSync(SUBTITLE_FILE_PATH, "utf-8");
  const segments = splitSubtitles(subtitleData, OUTPUT_DIR);

  console.log(`Split subtitles saved at: ${segments.join(", ")}`);
})();
