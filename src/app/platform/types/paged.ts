/** Mirrors PagedResultOf… wrappers (`pageIndex`, not `page`). */
export interface Paged<T> {
  items: T[];
  totalCount: number;
  pageIndex: number;
  totalPages: number;
  /**
   * Set by `EmployeeService.listPaged` when its auto-pagination bound cut the result
   * short while the server still had more rows. Optional so other `Paged` producers are
   * unaffected; absent means "as complete as the caller asked for".
   */
  truncated?: boolean;
}
