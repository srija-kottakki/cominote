import AppKit
import Foundation
import Vision

struct OCRLine: Codable {
    let text: String
    let confidence: Float
    let boundingBox: [Double]
}

struct OCRResult: Codable {
    let text: String
    let lines: [OCRLine]
    let error: String?
}

func emit(_ result: OCRResult) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.withoutEscapingSlashes]
    if let data = try? encoder.encode(result), let json = String(data: data, encoding: .utf8) {
        print(json)
    } else {
        print("{\"text\":\"\",\"lines\":[],\"error\":\"Could not encode OCR result.\"}")
    }
}

guard CommandLine.arguments.count >= 2 else {
    emit(OCRResult(text: "", lines: [], error: "Missing image path."))
    exit(2)
}

let imagePath = CommandLine.arguments[1]
let imageURL = URL(fileURLWithPath: imagePath)

guard let image = NSImage(contentsOf: imageURL) else {
    emit(OCRResult(text: "", lines: [], error: "Could not open image for OCR."))
    exit(3)
}

var proposedRect = CGRect(origin: .zero, size: image.size)
guard let cgImage = image.cgImage(forProposedRect: &proposedRect, context: nil, hints: nil) else {
    emit(OCRResult(text: "", lines: [], error: "Could not prepare image for OCR."))
    exit(4)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

do {
    try handler.perform([request])
} catch {
    let nsError = error as NSError
    emit(OCRResult(text: "", lines: [], error: "Vision OCR failed: \(nsError.domain) \(nsError.code) \(nsError.localizedDescription) \(nsError.userInfo)"))
    exit(5)
}

let observations = request.results ?? []
let lines: [OCRLine] = observations.compactMap { observation in
    guard let candidate = observation.topCandidates(1).first else {
        return nil
    }
    let text = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else {
        return nil
    }
    let box = observation.boundingBox
    return OCRLine(
        text: text,
        confidence: candidate.confidence,
        boundingBox: [box.minX, box.minY, box.width, box.height]
    )
}

emit(OCRResult(text: lines.map { $0.text }.joined(separator: "\n"), lines: lines, error: nil))
