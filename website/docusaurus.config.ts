import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Webcake Docs',
  tagline: 'Developer documentation for Webcake / Storecake',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  // CHANGE these when you have a real domain:
  url: 'https://webcakedocs.vercel.app',
  baseUrl: '/',

  // CHANGE to your GitHub org/repo if you want "Edit this page" links to work
  organizationName: 'vuluu2k',
  projectName: 'storecake_dev_docs',

  onBrokenLinks: 'warn',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/',
          editUrl:
            'https://github.com/vuluu2k/storecake_dev_docs/tree/main/website/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  clientModules: [require.resolve('./src/clientModules/copyPageUrl.ts')],

  themes: [
    [
      require.resolve('@easyops-cn/docusaurus-search-local'),
      {
        hashed: true,
        indexBlog: false,
        docsRouteBasePath: '/',
        highlightSearchTermsOnTargetPage: true,
        searchBarShortcut: true,
        searchBarShortcutHint: true,
      },
    ],
  ],

  themeConfig: {
    image: 'img/docusaurus-social-card.jpg',
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: 'Webcake Docs',
      logo: {
        alt: 'Webcake Logo',
        src: 'img/logo-mark.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://github.com/vuluu2k/storecake_dev_docs',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['elixir', 'bash', 'json'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
