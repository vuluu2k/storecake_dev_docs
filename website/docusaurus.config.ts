import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Storecake Dev Docs',
  tagline: 'Developer documentation for Webcake / Storecake',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  // CHANGE these when you have a real domain:
  url: 'https://docs.example.com',
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

  themeConfig: {
    image: 'img/docusaurus-social-card.jpg',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Storecake Dev Docs',
      logo: {
        alt: 'Storecake Logo',
        src: 'img/logo.svg',
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
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {label: 'Overview', to: '/'},
            {label: 'Git flow', to: '/git-flow'},
          ],
        },
        {
          title: 'Projects',
          items: [
            {label: 'Storecake Builder', to: '/storecake-builder/technology'},
            {label: 'Storecake API', to: '/storecake-api/technology'},
            {label: 'Webcake API', to: '/webcake-api/installation'},
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/vuluu2k/storecake_dev_docs',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Pancake / Webcake. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['elixir', 'bash', 'json'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
