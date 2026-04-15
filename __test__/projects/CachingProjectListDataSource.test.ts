import { ProjectSummary, CachingProjectListDataSource } from "@/features/projects/domain"

const projects: ProjectSummary[] = [{
  id: "acme-foo",
  name: "foo",
  displayName: "Foo",
  owner: "acme",
  ownerUrl: "https://github.com/acme"
}]

test("It returns cached projects when cache is populated", async () => {
  let didCallDataSource = false
  const sut = new CachingProjectListDataSource({
    dataSource: {
      async getProjectList() {
        didCallDataSource = true
        return projects
      }
    },
    repository: {
      async get() {
        return projects
      },
      async set() {},
      async delete() {}
    }
  })
  const result = await sut.getProjectList()
  expect(result).toEqual(projects)
  expect(didCallDataSource).toBe(false)
})

test("It fetches and caches projects when cache is empty", async () => {
  let cachedProjects: ProjectSummary[] | undefined
  const sut = new CachingProjectListDataSource({
    dataSource: {
      async getProjectList() {
        return projects
      }
    },
    repository: {
      async get() {
        return undefined
      },
      async set(value) {
        cachedProjects = value
      },
      async delete() {}
    }
  })
  const result = await sut.getProjectList()
  expect(result).toEqual(projects)
  expect(cachedProjects).toEqual(projects)
})

test("It treats an empty cached list as a valid cache hit and does not call the data source", async () => {
  let didCallDataSource = false
  const sut = new CachingProjectListDataSource({
    dataSource: {
      async getProjectList() {
        didCallDataSource = true
        return []
      }
    },
    repository: {
      async get() {
        return []
      },
      async set() {},
      async delete() {}
    }
  })
  const result = await sut.getProjectList()
  expect(result).toEqual([])
  expect(didCallDataSource).toBe(false)
})

test("It bypasses cache and refreshes when refresh=true", async () => {
  let didCallDataSource = false
  let cachedProjects: ProjectSummary[] | undefined
  const sut = new CachingProjectListDataSource({
    dataSource: {
      async getProjectList() {
        didCallDataSource = true
        return projects
      }
    },
    repository: {
      async get() {
        return projects
      },
      async set(value) {
        cachedProjects = value
      },
      async delete() {}
    }
  })
  const result = await sut.getProjectList({ refresh: true })
  expect(result).toEqual(projects)
  expect(didCallDataSource).toBe(true)
  expect(cachedProjects).toEqual(projects)
})
