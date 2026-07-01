export interface ParseResult {
  gameId: string;
  puzzleNumber: number | null;
  variant: string | null;
  value: number;
  solved: boolean;
}

export interface Parser {
  gameId: string;
  detect(text: string): boolean;
  parse(text: string): ParseResult;
}
