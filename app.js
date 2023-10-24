import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";

const VIDEO_FILE_PATH = "video.mp4";
const SUBTITLE_FILE_PATH = "subtitle.srt";
const OUTPUT_DIR = "output";

async function splitVideo() {
  // Ensure the output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
  }

  // Get video duration
  const videoDuration = await new Promise((resolve, reject) => {
    ffmpeg.ffprobe(VIDEO_FILE_PATH, (err, metadata) => {
      if (err) reject(err);
      resolve(metadata.format.duration);
    });
  });

  const numberOfClips = Math.ceil(videoDuration / 60);

  for (let i = 0; i < numberOfClips; i++) {
    const outputFilePath = path.join(OUTPUT_DIR, `clip_${i + 1}.mp4`);

    ffmpeg(VIDEO_FILE_PATH)
      .seekInput(i * 60)
      .duration(60)
      .on("end", () => {
        console.log(`Segment ${i + 1} is finished.`);
      })
      .save(outputFilePath);
  }
}

// Parse SRT file
function parseSRT(data) {
  const blocks = data.split("\n\n");
  let items = [];

  blocks.forEach((block) => {
    const lines = block.split("\n");
    if (lines[1]) {
      const time = lines[1].split(" --> ");
      const text = lines.slice(2).join(" ");

      items.push({ start: time[0], end: time[1], text: text });
    }
  });

  return items;
}

// Split video by 30 seconds
function splitByTime(items, timeInSecs) {
  let segments = [];
  let start = items[0].start;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (timeDiffInSeconds(start, item.end) > timeInSecs) {
      segments.push({ start: start, end: item.end });
      start = item.end;
    }

    // Push the last segment
    if (i === items.length - 1) {
      segments.push({ start: start, end: item.end });
    }
  }

  return segments;
}

// Calculate time difference in seconds
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
function splitSubtitles(data) {
  const items = parseSRT(data);
  const segments = splitByTime(items, 60);
  let segmentFiles = [];

  segments.forEach((segment, index) => {
    const segmentSubtitles = items.filter(
      (item) =>
        timeDiffInSeconds(segment.start, item.start) >= 0 &&
        timeDiffInSeconds(segment.end, item.end) <= 0
    );

    if (segmentSubtitles.length > 0) {
      let srtContent = "";
      segmentSubtitles.forEach((subtitle, subIndex) => {
        srtContent += `${subIndex + 1}\n${subtitle.start} --> ${
          subtitle.end
        }\n${subtitle.text}\n\n`;
      });

      const segmentFilePath = path.join(
        OUTPUT_DIR,
        `subtitle_segment_${index + 1}.srt`
      );
      fs.writeFileSync(segmentFilePath, srtContent.trim());
      segmentFiles.push(segmentFilePath);
    }
  });

  return segmentFiles;
}

// Run the functions
splitVideo();
const subtitleData = fs.readFileSync(SUBTITLE_FILE_PATH, "utf-8");
const segments = splitSubtitles(subtitleData);
console.log(`Split subtitles saved at: ${segments.join(", ")}`);
