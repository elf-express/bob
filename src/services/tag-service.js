const path = require('path');
const { TagRepository } = require('../db/repositories/tag-repository');

const TAG_RULES = [
  { id: 'ui', matchers: [(p) => /(?:^|\/)components(?:\/|$)/i.test(p), (p) => /(?:^|\/)views(?:\/|$)/i.test(p)] },
  { id: 'router', matchers: [(p) => /(?:^|\/)router(?:\/|$)/i.test(p)] },
  { id: 'api', matchers: [(p) => /(?:^|\/)api(?:\/|$)/i.test(p)] },
  { id: 'store', matchers: [(p) => /(?:^|\/)stores?(?:\/|$)/i.test(p)] },
  { id: 'utils', matchers: [(p) => /(?:^|\/)utils(?:\/|$)/i.test(p), (p) => /(?:^|\/)helpers(?:\/|$)/i.test(p)] },
  { id: 'config', matchers: [(p) => /\.config\.[a-z]+$/i.test(p), (p) => /(?:^|\/)tsconfig[^/]*$/i.test(p), (p) => /(?:^|\/)\.env[^/]*$/i.test(p)] },
  { id: 'layout', matchers: [(p) => /(?:^|\/)layouts(?:\/|$)/i.test(p)] },
  { id: 'hook', matchers: [(p) => /(?:^|\/)hooks(?:\/|$)/i.test(p), (p) => /(?:^|\/)composables(?:\/|$)/i.test(p)] },
  { id: 'i18n', matchers: [(p) => /(?:^|\/)locales(?:\/|$)/i.test(p), (p) => /(?:^|\/)i18n(?:\/|$)/i.test(p)] },
  { id: 'style', matchers: [(p) => /(?:^|\/)design(?:\/|$)/i.test(p), (p) => /(?:^|\/)styles(?:\/|$)/i.test(p), (p) => /\.(?:css|scss|less)$/i.test(p)] },
  { id: 'plugin', matchers: [(p) => /(?:^|\/)plugins(?:\/|$)/i.test(p)] },
  { id: 'type', matchers: [(p) => /(?:^|\/)types(?:\/|$)/i.test(p), (p) => /\.d\.ts$/i.test(p)] },
  { id: 'test', matchers: [(p) => /\.test\.[a-z]+$/i.test(p), (p) => /\.spec\.[a-z]+$/i.test(p), (p) => /(?:^|\/)__tests__(?:\/|$)/i.test(p)] },
];

class TagService {
  constructor(projectDir, db) {
    this.projectDir = projectDir;
    this.repo = new TagRepository(db);
  }

  normalizePath(relativePath) {
    return String(relativePath || '').split(path.sep).join('/');
  }

  suggestTags(relativePath) {
    const normalized = this.normalizePath(relativePath);
    const tags = [];

    for (const rule of TAG_RULES) {
      for (const matcher of rule.matchers) {
        if (matcher(normalized)) {
          tags.push(rule.id);
          break;
        }
      }
    }
    return tags;
  }

  async getCustomTags() {
    return await this.repo.getAllCustomTags();
  }

  async setCustomTag(filePath, tags) {
    await this.repo.setCustomTags(filePath, tags || []);
  }

  async getTags(relativePath) {
    const suggested = this.suggestTags(relativePath);
    const customTags = await this.repo.getCustomTagsByPath(relativePath);
    return [...new Set([...(customTags || []), ...suggested])];
  }
}

module.exports = { TagService, TAG_RULES };
