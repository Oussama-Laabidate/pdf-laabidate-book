// Mock file to resolve canvas module compilation errors in pdfjs-dist
export const createCanvas = () => null;
const canvasMock = {
  createCanvas: () => null
};

export default canvasMock;
