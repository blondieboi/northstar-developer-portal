import AppKit
import AVFoundation
import CoreGraphics
import Foundation

let repository = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let imageDirectory = repository.appendingPathComponent("docs/public/images")
let imageNames = [
  "perongen-overview.png",
  "perongen-map.png",
  "perongen-scorecards.png",
]
let output = imageDirectory.appendingPathComponent("perongen-tour.mp4")
let width = 1280
let height = 720
let framesPerSecond: Int32 = 30
let framesPerSlide = Int(framesPerSecond) * 4
let crossfadeFrames = Int(framesPerSecond) / 2

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data("\(message)\n".utf8))
  exit(1)
}

let images: [CGImage] = imageNames.map { name in
  let url = imageDirectory.appendingPathComponent(name)
  guard
    let image = NSImage(contentsOf: url),
    let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
  else { fail("Could not read \(url.path)") }
  return cgImage
}

try? FileManager.default.removeItem(at: output)
guard let writer = try? AVAssetWriter(outputURL: output, fileType: .mp4) else {
  fail("Could not create the launch video writer")
}
let input = AVAssetWriterInput(
  mediaType: .video,
  outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: width,
    AVVideoHeightKey: height,
    AVVideoCompressionPropertiesKey: [
      AVVideoAverageBitRateKey: 2_200_000,
      AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
    ],
  ]
)
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(
  assetWriterInput: input,
  sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    kCVPixelBufferWidthKey as String: width,
    kCVPixelBufferHeightKey as String: height,
  ]
)
guard writer.canAdd(input) else { fail("The launch video input is unsupported") }
writer.add(input)
guard writer.startWriting() else {
  fail(writer.error?.localizedDescription ?? "The launch video could not start")
}
writer.startSession(atSourceTime: .zero)

func draw(_ image: CGImage, in context: CGContext, alpha: CGFloat) {
  let scale = min(
    CGFloat(width) / CGFloat(image.width),
    CGFloat(height) / CGFloat(image.height)
  )
  let drawWidth = CGFloat(image.width) * scale
  let drawHeight = CGFloat(image.height) * scale
  let rectangle = CGRect(
    x: (CGFloat(width) - drawWidth) / 2,
    y: (CGFloat(height) - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight
  )
  context.saveGState()
  context.setAlpha(alpha)
  context.draw(image, in: rectangle)
  context.restoreGState()
}

let frameCount = images.count * framesPerSlide
for frame in 0..<frameCount {
  while !input.isReadyForMoreMediaData { usleep(1_000) }
  guard let pool = adaptor.pixelBufferPool else {
    fail("The video frame pool is unavailable")
  }
  var pixelBuffer: CVPixelBuffer?
  guard
    CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pixelBuffer) == kCVReturnSuccess,
    let buffer = pixelBuffer
  else { fail("Could not allocate a video frame") }
  CVPixelBufferLockBaseAddress(buffer, [])
  guard let context = CGContext(
    data: CVPixelBufferGetBaseAddress(buffer),
    width: width,
    height: height,
    bitsPerComponent: 8,
    bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
    space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGBitmapInfo.byteOrder32Little.rawValue |
      CGImageAlphaInfo.premultipliedFirst.rawValue
  ) else { fail("Could not render a video frame") }
  context.setFillColor(CGColor(red: 0.08, green: 0.11, blue: 0.09, alpha: 1))
  context.fill(CGRect(x: 0, y: 0, width: width, height: height))
  context.translateBy(x: 0, y: CGFloat(height))
  context.scaleBy(x: 1, y: -1)
  let slide = min(frame / framesPerSlide, images.count - 1)
  let localFrame = frame % framesPerSlide
  let nextSlide = min(slide + 1, images.count - 1)
  let fade = slide == nextSlide || localFrame < framesPerSlide - crossfadeFrames
    ? CGFloat(0)
    : CGFloat(localFrame - (framesPerSlide - crossfadeFrames)) / CGFloat(crossfadeFrames)
  draw(images[slide], in: context, alpha: 1 - fade)
  if fade > 0 { draw(images[nextSlide], in: context, alpha: fade) }
  CVPixelBufferUnlockBaseAddress(buffer, [])
  let time = CMTime(value: Int64(frame), timescale: framesPerSecond)
  guard adaptor.append(buffer, withPresentationTime: time) else {
    fail(writer.error?.localizedDescription ?? "Could not append a video frame")
  }
}

input.markAsFinished()
let completion = DispatchSemaphore(value: 0)
writer.finishWriting { completion.signal() }
completion.wait()
guard writer.status == .completed else {
  fail(writer.error?.localizedDescription ?? "The launch video could not finish")
}
print("Created \(output.path)")
