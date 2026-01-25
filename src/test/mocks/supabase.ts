import { vi, type Mock } from "vitest";

// Type for chainable query builder
interface MockQueryBuilder {
  select: Mock;
  insert: Mock;
  update: Mock;
  delete: Mock;
  eq: Mock;
  neq: Mock;
  gt: Mock;
  gte: Mock;
  lt: Mock;
  lte: Mock;
  like: Mock;
  ilike: Mock;
  is: Mock;
  in: Mock;
  order: Mock;
  limit: Mock;
  single: Mock;
  maybeSingle: Mock;
  then: Mock;
}

// Create the query builder
const createMockQueryBuilder = (): MockQueryBuilder => {
  const builder: MockQueryBuilder = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    eq: vi.fn(),
    neq: vi.fn(),
    gt: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(),
    lte: vi.fn(),
    like: vi.fn(),
    ilike: vi.fn(),
    is: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
    then: vi.fn((resolve) => resolve({ data: null, error: null })),
  };

  // Make all methods return the builder for chaining
  Object.keys(builder).forEach((key) => {
    if (key !== 'then') {
      (builder[key as keyof MockQueryBuilder] as Mock).mockReturnValue(builder);
    }
  });

  return builder;
};

export const mockQueryBuilder = createMockQueryBuilder();

// Mock Supabase client for testing
export const mockSupabaseClient = {
  from: vi.fn().mockReturnValue(mockQueryBuilder),
  functions: {
    invoke: vi.fn(),
  },
  rpc: vi.fn(),
};

// Helper to reset all mocks
export function resetSupabaseMocks() {
  vi.clearAllMocks();
  
  // Reset chainable methods to return the builder
  Object.keys(mockQueryBuilder).forEach((key) => {
    if (key !== 'then') {
      (mockQueryBuilder[key as keyof MockQueryBuilder] as Mock).mockReturnValue(mockQueryBuilder);
    }
  });
  
  mockQueryBuilder.then.mockImplementation((resolve) => resolve({ data: null, error: null }));
  mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
}

// Helper to mock query response
export function mockQueryResponse<T>(data: T | null, error: { message: string } | null = null) {
  mockQueryBuilder.then.mockImplementation((resolve) => 
    resolve({ data, error, count: Array.isArray(data) ? data.length : null })
  );
  return mockQueryBuilder;
}

// Set response for subsequent query
export function setQueryResponse<T>(data: T | null, error: { message: string } | null = null) {
  mockQueryBuilder.then.mockImplementationOnce((resolve) => 
    resolve({ data, error, count: Array.isArray(data) ? data.length : null })
  );
}
