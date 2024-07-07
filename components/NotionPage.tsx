import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import * as React from 'react';
import BodyClassName from 'react-body-classname';
// core notion renderer
import { NotionRenderer } from 'react-notion-x';
import TweetEmbed from 'react-tweet-embed';
import { useSearchParam } from 'react-use';

import cs from 'classnames';
import * as config from 'lib/config';
import { mapImageUrl } from 'lib/map-image-url';
import { getCanonicalPageUrl, mapPageUrl } from 'lib/map-page-url';
import { searchNotion } from 'lib/search-notion';
import * as types from 'lib/types';
import { useDarkMode } from 'lib/use-dark-mode';
import { PageBlock } from 'notion-types';
// utils
import { formatDate, getBlockTitle, getPageProperty } from 'notion-utils';

import { loadPrismComponentsWithRetry } from '~/lib/load-prism-components';

import Comments from './Comments';
// components
import { Loading } from './Loading';
// import { Footer } from './Footer';
import { NotionPageHeader, ToggleThemeButton } from './NotionPageHeader';
import { Page404 } from './Page404';
import { PageAside } from './PageAside';
import { PageHead } from './PageHead';
import styles from './styles.module.css';
import { useEffect } from 'react';
import { useRef } from 'react';
import { useState } from 'react';
import { is } from 'date-fns/locale';

// -----------------------------------------------------------------------------
// dynamic imports for optional components
// -----------------------------------------------------------------------------

const Code = dynamic(() =>
  import('react-notion-x/third-party/code').then(async m => {
    // add / remove any prism syntaxes here
    await loadPrismComponentsWithRetry([
      () => import('prismjs/components/prism-markup-templating.js'),
      () => import('prismjs/components/prism-markup.js'),
      () => import('prismjs/components/prism-bash.js'),
      () => import('prismjs/components/prism-c.js'),
      () => import('prismjs/components/prism-cpp.js'),
      () => import('prismjs/components/prism-csharp.js'),
      () => import('prismjs/components/prism-docker.js'),
      () => import('prismjs/components/prism-java.js'),
      () => import('prismjs/components/prism-js-templates.js'),
      () => import('prismjs/components/prism-coffeescript.js'),
      () => import('prismjs/components/prism-diff.js'),
      () => import('prismjs/components/prism-git.js'),
      () => import('prismjs/components/prism-go.js'),
      () => import('prismjs/components/prism-graphql.js'),
      () => import('prismjs/components/prism-handlebars.js'),
      () => import('prismjs/components/prism-less.js'),
      () => import('prismjs/components/prism-makefile.js'),
      () => import('prismjs/components/prism-markdown.js'),
      () => import('prismjs/components/prism-objectivec.js'),
      () => import('prismjs/components/prism-ocaml.js'),
      () => import('prismjs/components/prism-python.js'),
      () => import('prismjs/components/prism-reason.js'),
      () => import('prismjs/components/prism-rust.js'),
      () => import('prismjs/components/prism-sass.js'),
      () => import('prismjs/components/prism-scss.js'),
      () => import('prismjs/components/prism-solidity.js'),
      () => import('prismjs/components/prism-sql.js'),
      () => import('prismjs/components/prism-stylus.js'),
      () => import('prismjs/components/prism-swift.js'),
      () => import('prismjs/components/prism-wasm.js'),
      () => import('prismjs/components/prism-yaml.js'),
    ]);

    return m.Code;
  }),
);

const Collection = dynamic(() =>
  import('react-notion-x/third-party/collection').then(m => m.Collection),
);
const Equation = dynamic(() => import('react-notion-x/third-party/equation').then(m => m.Equation));
const Pdf = dynamic(() => import('react-notion-x/third-party/pdf').then(m => m.Pdf), {
  ssr: false,
});
const Modal = dynamic(
  () =>
    import('react-notion-x/third-party/modal').then(m => {
      m.Modal.setAppElement('.notion-viewport');
      return m.Modal;
    }),
  {
    ssr: false,
  },
);

const Tweet = ({ id }: { id: string }) => {
  return <TweetEmbed tweetId={id} />;
};

const propertyLastEditedTimeValue = ({ block, pageHeader }, defaultFn: () => React.ReactNode) => {
  if (pageHeader && block?.last_edited_time) {
    return `Last updated ${formatDate(block?.last_edited_time, {
      month: 'long',
    })}`;
  }

  return defaultFn();
};

const propertyDateValue = ({ data, schema, pageHeader }, defaultFn: () => React.ReactNode) => {
  if (pageHeader && schema?.name?.toLowerCase() === 'published') {
    const publishDate = data?.[0]?.[1]?.[0]?.[1]?.start_date;

    if (publishDate) {
      return `Published ${formatDate(publishDate, {
        month: 'long',
      })}`;
    }
  }

  return defaultFn();
};

const propertyTextValue = ({ schema, pageHeader }, defaultFn: () => React.ReactNode) => {
  if (pageHeader && schema?.name?.toLowerCase() === 'author') {
    return <b>{defaultFn()}</b>;
  }

  return defaultFn();
};

export const NotionPage: React.FC<types.PageProps> = ({
  site,
  recordMap,
  error,
  pageId,
  draftView,
}) => {
  const router = useRouter();
  const lite = useSearchParam('lite');

  const components = React.useMemo(
    () => ({
      nextImage: Image,
      nextLink: Link,
      Code,
      Collection,
      Equation,
      Pdf,
      Modal,
      Tweet,
      Header: NotionPageHeader,
      propertyLastEditedTimeValue,
      propertyTextValue,
      propertyDateValue,
      PageLink: ({ children, href, ...rest }) => (
        <Link href={href} {...rest}>
          {children}
        </Link>
      ),
    }),
    [],
  );

  // lite mode is for oembed
  const isLiteMode = lite === 'true';

  const { isDarkMode } = useDarkMode();

  const siteMapPageUrl = React.useMemo(() => {
    const params: any = {};
    if (lite) params.lite = lite;

    const searchParams = new URLSearchParams(params);
    return mapPageUrl(site, recordMap, searchParams, draftView);
  }, [site, recordMap, lite, draftView]);

  const keys = Object.keys(recordMap?.block || {});
  const block = recordMap?.block?.[keys[0]]?.value;

  // const isRootPage =
  //   parsePageId(block?.id) === parsePageId(site?.rootNotionPageId)
  const isBlogPost = block?.type === 'page' && block?.parent_table === 'collection';

  const showTableOfContents = !!isBlogPost;
  const minTableOfContentsItems = 1;

  const pageAside = React.useMemo(
    () => <PageAside block={block} recordMap={recordMap} isBlogPost={isBlogPost} />,
    [block, recordMap, isBlogPost],
  );

  // const footer = React.useMemo(() => <Footer />, []);

  if (router.isFallback) {
    return null;
  }

  if (error || !site || !block) {
    return <Page404 site={site} pageId={pageId} error={error} />;
  }

  const title = getBlockTitle(block, recordMap) || site.name;

  if (!config.isServer) {
    // add important objects to the window global for easy debugging
    const g = window as any;
    g.pageId = pageId;
    g.recordMap = recordMap;
    g.block = block;
  }

  const canonicalPageUrl = !config.isDev && getCanonicalPageUrl(site, recordMap)(pageId);

  const socialImage = mapImageUrl(
    getPageProperty<string>('Social Image', block, recordMap) ||
      (block as PageBlock).format?.page_cover ||
      config.defaultPageCover,
    block,
  );

  const socialDescription = getPageProperty<string>('설명', block, recordMap) || config.description;

  const isIndexPage = pageId === site.rootNotionPageId;

  const hasCollectionView = Object.keys(recordMap.collection_query).length;

  const [isLoadingTTS, setIsLoadingTTS] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const nextAudioRef = useRef<HTMLAudioElement | null>(null);
  const isPlayingRef = useRef<boolean>(false);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
  const text = (document.querySelector(".notion-page-content-inner") as HTMLElement)?.innerText;
  const content = text
    // 이미지 제거
    .replace(/!\[([^\]]+?)\]\([^)]+?\)/g, '')
    // 링크는 텍스트만 남기고 제거
    .replace(/\[([^\]]+?)\]\([^)]+?\)/g, '$1')
    // 코드 블록 제거
    .replace(/```[^\n]+?\n([\s\S]+?)\n```/g, '')
    // 불렛 제거
    .replace(/- ([^\n]+?)\n/g, '$1\n')
    // 특수문자 제거
    .replace(/([*_`~#>])/g, '')
    // '출처 : <링크>' 형태 제거
    .replace(/출처\s*:\s*https?:\/\/[^\s]+/g, '')
    // 좌우 공백 제거
    .trim();

  let cntWord = content?.split(" ").length || 0;
  const readWPM = 200;
  let readMinute = Math.trunc(cntWord / readWPM);
  let readSecond = Math.round((cntWord / readWPM - readMinute) * 60 / 10) * 10;
  if (readSecond === 60) { readSecond = 0; readMinute += 1; };

  (window as any).toggleTTS = function () {
    TTS();
  };

  setTimeout(() => {
  const customHeader = document.querySelector('.notion-collection-page-properties .notion-collection-row');
  if (customHeader) {
    customHeader.innerHTML += `
      <span class="notion-user-name"  style="opacity: .7; font-size: 14px;">🕒 읽는 데 ${readMinute}분 예상 &nbsp;<span style="opacity:.4; font-size: 9px">|</span>&nbsp;</div></span>
      <span class="notion-property notion-property-date tts-btn" onClick="javascript:window.toggleTTS()" style="opacity: .7; cursor: pointer; font-size: 14px;">🔊&nbsp;&nbsp;음성으로 듣기</div></span>`;
  }
  }, 100);
  }, []);

  useEffect(() => {
    const ttsButton = document.querySelector('.notion-property.notion-property-date.tts-btn');
    if (ttsButton) {
      ttsButton.innerHTML = isPlaying ? '🔊&nbsp;&nbsp;음성으로 듣기 정지' : '🔊&nbsp;&nbsp;음성으로 듣기';
    }
  }, [isPlaying]);

  async function TTS(): Promise<void> {
    if (isPlayingRef.current) {
      controllerRef.current?.abort();
      currentAudioRef.current?.pause();
      nextAudioRef.current?.pause();
      currentAudioRef.current = null;
      nextAudioRef.current = null;
      setIsPlaying(false);
      isPlayingRef.current = false;
      setIsLoadingTTS(false);
      return;
    }

    setIsLoadingTTS(true);
    setIsPlaying(true);

    controllerRef.current = new AbortController();
    const content = (document.querySelector(".notion-page-content-inner") as HTMLElement)?.innerText;
    const text = content
    // 이미지 제거
    .replace(/!\[([^\]]+?)\]\([^)]+?\)/g, '')
    // 링크는 텍스트만 남기고 제거
    .replace(/\[([^\]]+?)\]\([^)]+?\)/g, '$1')
    // 코드 블록 제거
    .replace(/```[^\n]+?\n([\s\S]+?)\n```/g, '')
    // 불렛 제거
    .replace(/- ([^\n]+?)\n/g, '$1\n')
    // 특수문자 제거
    .replace(/([*_`~#>])/g, '')
    // '출처 : <링크>' 형태 제거
    .replace(/출처\s*:\s*https?:\/\/[^\s]+/g, '')
    // 좌우 공백 제거
    .trim();

    const paragraphs = text.split("\n").filter(p => p && p.length > 1);

    for (let i = 0; i < paragraphs.length; i++) {
      try {
        await playParagraph(paragraphs[i], i < paragraphs.length - 1 ? paragraphs[i + 1] : null, controllerRef.current.signal);
      } catch (error: any) {
        if (error.name === "AbortError") {
          console.log("Fetch request has been aborted");
          break;
        } else {
          console.error(error);
        }
      }
    }

    setIsPlaying(false);
  }

  async function playParagraph(currentText: string, nextText: string | null, signal: AbortSignal): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        if (!currentAudioRef.current) {
          currentAudioRef.current = await createAudioElement(currentText, signal);
        }

        if (nextText && !nextAudioRef.current) {
          nextAudioRef.current = await createAudioElement(nextText, signal);
        }

        setIsLoadingTTS(false);

        currentAudioRef.current.onplay = () => setIsPlaying(true);
        currentAudioRef.current.onended = () => {
          if (nextAudioRef.current) {
            currentAudioRef.current = nextAudioRef.current;
            nextAudioRef.current = null;
            currentAudioRef.current.play();
          }
          resolve();
        };

        await currentAudioRef.current.play();
      } catch (error: any) {
        reject(error);
      }
    });
  }

  async function createAudioElement(text: string, signal: AbortSignal): Promise<HTMLAudioElement> {
    const options: Object = {
      method: "POST",
      headers: {
        "xi-api-key": process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 1,
          similarity_boost: 1,
        },
      }),
      signal,
    };

    const response = await fetch("https://api.elevenlabs.io/v1/text-to-speech/6WKnjxyhfi8k86ffrkFz/stream", options);
    const audio = await response.blob();
    const audioURL = URL.createObjectURL(audio);
    return new Audio(audioURL);
  }

  return (
    <>
      <PageHead
        pageId={pageId}
        site={site}
        title={title}
        description={socialDescription}
        image={socialImage}
        url={canonicalPageUrl}
      />
      {isLiteMode && <BodyClassName className="notion-lite" />}

      <NotionRenderer
        className={cs(isBlogPost ? 'childPage' : 'indexPage', { hasCollectionView })}
        bodyClassName={cs(styles.notion, isIndexPage && 'index-page')}
        darkMode={isDarkMode}
        components={components}
        recordMap={recordMap}
        rootPageId={site.rootNotionPageId}
        rootDomain={site.domain}
        fullPage={!isLiteMode}
        previewImages={!!recordMap.preview_images}
        showCollectionViewDropdown={false}
        showTableOfContents={showTableOfContents}
        minTableOfContentsItems={minTableOfContentsItems}
        defaultPageIcon={config.defaultPageIcon}
        defaultPageCover={config.defaultPageCover}
        defaultPageCoverPosition={config.defaultPageCoverPosition}
        mapPageUrl={siteMapPageUrl}
        mapImageUrl={mapImageUrl}
        searchNotion={config.isSearchEnabled ? searchNotion : null}
        pageAside={pageAside}
        pageFooter={
          config.enableComment ? (
            !isBlogPost ? null : (
              <Comments pageId={pageId} recordMap={recordMap} />
            )
          ) : null
        }
        footer={null}
      />
    </>
  );
};
