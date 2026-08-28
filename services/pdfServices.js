import fs from "fs";
import { PDFParse } from "pdf-parse";

const extractTextFromPDF = async (filePath) => {
  let parser;

  try {
    // Read the uploaded PDF
    const pdfBuffer = fs.readFileSync(filePath);

    // Create the PDF parser
    parser = new PDFParse({
      data: pdfBuffer,
    });

    // Extract text
    const data = await parser.getText();

    return data.text;
  } catch (error) {
    console.error("PDF extraction error:", error);

    throw new Error("Failed to extract text from PDF");
  } finally {
    // Clean up parser resources
    if (parser) {
      await parser.destroy();
    }
  }
};

export default extractTextFromPDF;