export interface IProcessogramQuestion {
  processogramId: string;
  elementId: string;
  question: string;
  options: string[];
  correctAnswerIndex: number;
  createdAt: Date;
  updatedAt: Date;
}
