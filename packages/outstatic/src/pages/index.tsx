import { ApolloClient, ApolloProvider } from '@apollo/client'
import { GetServerSideProps } from 'next'
import { useRouter } from 'next/router'
import { ReactElement, useState } from 'react'
import { OutstaticProvider } from '../context'
import { CollectionsDocument } from '../graphql/generated'
import { Session } from '../types'
import { initializeApollo, useApollo } from '../utils/apollo'
import { getLoginSession } from '../utils/auth/auth'
import { hasMissingEnvVar, missingEnvVars } from '../utils/envVarsCheck'
import FourOhFour from './404'
import Collections from './content-types'
import Dashboard from './dashboard'
import EditContent from './edit-content'
import List from './list'
import Login from './login'
import Settings from './settings'
import Welcome from './welcome'

type OutstaticProps = {
  missingEnvVars: boolean[]
  providerData: {
    client: ApolloClient<any>
    repoOwner: string
    repoSlug: string
    contentPath: string
    monorepoPath: string
    session: Session | null
    initialApolloState?: null
    collections: string[]
    pages: string[]
  }
}

const defaultPages: { [key: string]: ReactElement | undefined } = {
  settings: <Settings />,
  'content-types': undefined
}

export const Outstatic = ({ missingEnvVars, providerData }: OutstaticProps) => {
  const [pages, setPages] = useState(providerData?.pages)
  const [collections, setCollections] = useState(providerData?.collections)
  const router = useRouter()
  const client = useApollo(providerData?.initialApolloState)

  const addPage = (page: string) => {
    if (pages.includes(page)) return
    if (collections.includes(page)) return
    setPages([...pages, page])
    setCollections([...collections, page])
  }

  const removePage = (page: string) => {
    setPages(pages.filter((p) => p !== page))
    setCollections(collections.filter((p) => p !== page))
    console.log('removePage', page)
  }

  if (missingEnvVars.length > 0) return <Welcome variables={missingEnvVars} />

  const { session } = providerData

  if (!session) {
    return <Login />
  }

  const slug = router.query?.ost?.[0] || ''
  const slug2 = router.query?.ost?.[1] || ''

  if (slug && !pages.includes(slug)) {
    return <FourOhFour />
  }

  const isContent = slug && collections.includes(slug)

  return (
    <OutstaticProvider
      {...providerData}
      pages={pages}
      collections={collections}
      addPage={addPage}
      removePage={removePage}
    >
      <ApolloProvider client={client}>
        {!slug && <Dashboard />}
        {slug2 && isContent && <EditContent collection={slug} />}
        {!slug2 && isContent ? <List collection={slug} /> : defaultPages[slug]}
        {!!slug2 && !isContent && <Collections />}
      </ApolloProvider>
    </OutstaticProvider>
  )
}

export const OstSSP: GetServerSideProps = async ({ req }) => {
  if (hasMissingEnvVar) {
    return {
      props: {
        missingEnvVars
      }
    }
  }

  const session = await getLoginSession(req)

  const apolloClient = session ? initializeApollo(null, session) : null

  let collections: String[] = []

  if (apolloClient) {
    try {
      const { data: postQueryData } = await apolloClient.query({
        query: CollectionsDocument,
        variables: {
          name: process.env.VERCEL_GIT_REPO_SLUG || process.env.OST_REPO_SLUG,
          contentPath: `HEAD:${
            process.env.OST_MONOREPO_PATH
              ? process.env.OST_MONOREPO_PATH + '/'
              : ''
          }${process.env.OST_CONTENT_PATH || 'outstatic/content'}`,
          owner: process.env.OST_REPO_OWNER || session?.user?.login || ''
        }
      })

      const postQueryObject = postQueryData?.repository?.object

      if (postQueryObject?.__typename === 'Tree') {
        collections = postQueryObject?.entries?.map(
          (entry: { name: any }) => entry.name
        ) as String[]
      }
    } catch (error) {
      console.log({ error })
    }
  }

  return {
    props: {
      missingEnvVars: [],
      providerData: {
        repoOwner: process.env.OST_REPO_OWNER || session?.user?.login || '',
        repoSlug: process.env.VERCEL_GIT_REPO_SLUG || process.env.OST_REPO_SLUG,
        contentPath: process.env.OST_CONTENT_PATH || 'outstatic/content',
        monorepoPath: process.env.OST_MONOREPO_PATH || '',
        session: session || null,
        initialApolloState: apolloClient?.cache.extract() || null,
        collections,
        pages: [...Object.keys(defaultPages), ...collections]
      }
    }
  }
}
