<div align="center">
<img width="200" src="https://github.com/shapehq/framna-docs/raw/main/logo.png" alt="Framna Docs logo" />
</div>

<div align="center">
<h3>👋 Welcome to Framna Docs</h3>
<h4>Self-hosted web portal that centralizes OpenAPI documentation and facilitates spec-driven development, built with GitHub-based authorization.</h4>
</div>

<div align="center">
<a href="https://github.com/shapehq/framna-docs/actions/workflows/build.yml"><img src="https://github.com/shapehq/framna-docs/actions/workflows/build.yml/badge.svg"></a>
<a href="https://github.com/shapehq/framna-docs/actions/workflows/run-unit-tests.yml"><img src="https://github.com/shapehq/framna-docs/actions/workflows/run-unit-tests.yml/badge.svg"></a>
<a href="https://github.com/shapehq/framna-docs/actions/workflows/test-sql-queries.yml"><img src="https://github.com/shapehq/framna-docs/actions/workflows/test-sql-queries.yml/badge.svg"></a>
<a href="https://github.com/shapehq/framna-docs/actions/workflows/lint.yml"><img src="https://github.com/shapehq/framna-docs/actions/workflows/lint.yml/badge.svg"></a>
<a href="https://github.com/shapehq/framna-docs/actions/workflows/build-docker-image"><img src="https://github.com/shapehq/framna-docs/actions/workflows/build-docker-image.yml/badge.svg"></a>
</div>

---

<div align="center">
<a href="#-getting-started">🚀 Getting Started</a>&nbsp;&nbsp;&nbsp;&nbsp;
<a href="#-how-does-it-work">👨‍🔧 How does it work?</a>&nbsp;&nbsp;&nbsp;&nbsp;
<a href="#-how-can-i-contribute">👩‍💻 How can I contribute?</a>&nbsp;&nbsp;&nbsp;&nbsp;
<a href="https://github.com/shapehq/framna-docs/wiki">📖 Wiki</a>
</div>

<hr />

Framna Docs makes managing and previewing OpenAPI documentation a breeze, streamlining spec-driven development. With GitHub-based authorization, you can easily control who accesses your docs. Framna Docs comments on pull requests that tweak your OpenAPI specs, giving you preview URLs to ensure every update is well-reviewed.

<div align="center">
<img width="600" src="https://github.com/shapehq/framna-docs/raw/main/wiki/home.png?raw=true" alt="Screenshot of Framna Docs"/>
</div>

## 🚀 Getting Started

Please refer to the following articles in [the wiki](https://github.com/shapehq/framna-docs/wiki) to get started with Framna Docs.

- [Adding Documentation to Framna Docs](https://github.com/shapehq/framna-docs/wiki/Adding-Documentation-to-Framna-Docs)
- [Browsing Documentation](https://github.com/shapehq/framna-docs/wiki/Browsing-Documentation)
- [Updating Documentation](https://github.com/shapehq/framna-docs/wiki/Updating-Documentation)
- [Deploying Framna Docs](https://github.com/shapehq/framna-docs/wiki/Deploying-Framna-Docs)

For repositories awaiting GitHub code-search indexing, see the [database discovery list](docs/project-discovery.md).

### Install the OpenAPI diff tool locally

Framna Docs relies on the [`oasdiff`](https://github.com/oasdiff/oasdiff) CLI when comparing specifications.  

On MacOS you can install with homebrew:

```bash
brew tap oasdiff/homebrew-oasdiff
brew install oasdiff
```

## 👨‍🔧 How does it work?

Framna Docs uses [OpenAPI specifications](https://swagger.io) from GitHub repositories. Users log in with their GitHub account to access documentation for projects they have access to. A repository only needs an OpenAPI spec to be recognized by Framna Docs, but customization is possible with a .framna-docs.yml file. Here's an example:

<img width="650" src="https://github.com/shapehq/framna-docs/raw/main/wiki/example-openapi-repository-with-config.png?raw=true"/>

Framna Docs supports spec-driven development by requiring OpenAPI specs in GitHub repos, ensuring version control and peer review. When a pull request is opened, Framna Docs comments with links to preview the documentation:

<img width="760" src="https://github.com/shapehq/framna-docs/raw/main/wiki/pr-comment.png?raw=true"/>

Learn more from the [Adding Documentation](https://github.com/shapehq/framna-docs/wiki/Adding-Documentation-to-Framna-Docs), [Browsing Documentation](https://github.com/shapehq/framna-docs/wiki/Browsing-Documentation), and [Updating Documentation](https://github.com/shapehq/framna-docs/wiki/Updating-Documentation) articles in the wiki.

## 👩‍💻 How can I contribute?

Pull requests with bugfixes and new features are much appreciated. We are happy to review PRs and merge them once they are ready, as long as they contain changes that fit within the vision of Framna Docs.

Clone the repository and consult the articles on [running Framna Docs locally](https://github.com/shapehq/framna-docs/wiki/Running-Framna-Docs-Locally) and [contributing](https://github.com/shapehq/framna-docs/wiki/Contributing) to get started contributing changes the project.

```bash
git clone git@github.com:shapehq/framna-docs.git
```

### 🔀 Git Workflow

Two following long-lived branches exist:

* **main**: Stable/release branch meant for deployment to the production environment.
* **develop**: Branch meant for deployment to a staging environment.

**Do's 👍**

- Features are branched off from `develop` and merged back in using a PR when ready. Rebase or merge `develop` in to keep the feature branch up to date. Squash merge the feature branch into `develop`.
- `develop` is merged into `main` whenever a new release is made. Only regular merge commits are allowed in this case. You do not need to bring develop up to date with `main` before merging.
- A hotfix is applied by branching out from `main`. The hotfix branch _must_ be merged into both `main` and `develop`.

**Don'ts 🙅‍♂️**

- Never squash merge `develop` into `main`.

## ❤️ The Product of a Shape Weekend

Before we became Framna, our company was known as Shape. Every year, we held "Shape Weekend", a three-day hackathon where all employees came together to build exciting new products. In 2023, one of those teams, passionate about documentation and spec-driven development, built Framna Docs. We have used it daily ever since.

---

Framna Docs is built with ❤️ by [Framna](https://framna.com/) in Denmark. Oh, and [we are hiring](https://framna.com/careers) 🤗
