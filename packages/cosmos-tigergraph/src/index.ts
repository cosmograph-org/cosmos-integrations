import { InputNode, InputLink } from '@cosmograph/cosmos'

export class TigerGraphConnection<N extends InputNode, L extends InputLink> {
  private host: string
  private graphname: string
  private username: string
  private password: string
  private token: string

  private constructor (host: string, graphname: string, username: string, password: string, token?: string) {
    this.host = host
    this.graphname = graphname
    this.username = username
    this.password = password
    this.token = token ?? ''
  }

  public async generateToken (): Promise<string> {
    return fetch(`${this.host}:9000/requesttoken`, {
      method: 'POST',
      body: `{"graph": "${this.graphname}"}`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${btoa(`${this.username}:${this.password}`)}`,
      },
    }).then(response => {
      if (!response.ok) {
        throw new Error(`Error! status: ${response.status}`)
      }

      return response.json()
    }).then(data => {
      this.token = data.results.token
      return this.token
    })
  }

  public async getTigerGraphData (vertexType: Array<string>, edgeType: Array<string>): Promise<{ nodes: N[]; links: L[] }> {
    return fetch(`${this.host}:14240/gsqlserver/interpreted_query`, {
      method: 'POST',
      body: `INTERPRET QUERY () FOR GRAPH ${this.graphname} {
          ListAccum<EDGE> @@edges;
          Seed = {${vertexType.join('.*, ')}.*};
          Res = SELECT d FROM Seed:d - ((${edgeType.join(' | ')}):e) -> :t
                  ACCUM @@edges += e;
          PRINT Seed;
          PRINT @@edges AS edges;
        }`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${btoa(`${this.username}:${this.password}`)}`,
      },
    }).then(response => {
      if (!response.ok) {
        throw new Error(`Error! status: ${response.status}`)
      }

      return response.json()
    }).then(data => {
      const links: L[] = []
      const nodes: N[] = []

      if (data.error) {
        throw new Error(`Error! status: ${data.message}`)
      }

      const vertices = data.results[0].Seed
      const edges = data.results[1].edges
      for (const vertex of vertices) {
        nodes.push({
          id: `${vertices[vertex].v_type}_${vertices[vertex].v_id}`,
          v_id: `${vertices[vertex].v_id}`,
          v_type: `${vertices[vertex].v_type}`,
          ...(vertices[vertex].attributes),

        })
      }
      for (const edge of edges) {
        links.push({
          source: `${edges[edge].from_type}_${edges[edge].from_id}`,
          target: `${edges[edge].to_type}_${edges[edge].to_id}`,
          ...(edges[edge].attributes),
        })
      }

      return { nodes, links }
    })
  }

  public async runInterpretedQuery (interpretedQuery: string): Promise<{ nodes: N[]; links: L[] }> {
    return fetch(`${this.host}:14240/gsqlserver/interpreted_query`, {
      method: 'POST',
      body: interpretedQuery,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${btoa(`${this.username}:${this.password}`)}`,
      },
    }).then(response => {
      if (!response.ok) {
        throw new Error(`Error! status: ${response.status}`)
      }

      return response.json()
    }).then(data => {
      const links: L[] = []
      const nodes: N[] = []

      if (data.error) {
        throw new Error(`Error! status: ${data.message}`)
      }

      data = data.results

      for (const res of data) {
        for (const key of data[res]) {
          const vertices = data[res][key]
          for (const vertex of vertices) {
            if (vertices[vertex].v_type === undefined || vertices[vertex].v_id === undefined) break
            const uniqueId = `${vertices[vertex].v_type}_${vertices[vertex].v_id}`
            const customAttributes = { id: uniqueId, v_id: `${vertices[vertex].v_id}`, v_type: `${vertices[vertex].v_type}` }
            nodes.push({ ...(vertices[vertex].attributes), ...customAttributes })
          }
          const edges = data[res][key]
          for (const edge of edges) {
            if (edges[edge].from_type === undefined || edges[edge].to_type === undefined) break
            const customAttributes = { source: `${edges[edge].from_type}_${edges[edge].from_id}`, target: `${edges[edge].to_type}_${edges[edge].to_id}` }
            links.push({ ...(edges[edge].attributes), ...customAttributes })
          }
        }
      }
      if (nodes.length === 0) {
        throw new Error('No vertices detected')
      } else if (links.length === 0) {
        throw new Error('No edges detected')
      }
      return { nodes, links }
    })
  }

  public async runQuery (queryName: string, params?: Record<string, unknown>): Promise<{ nodes: N[]; links: L[] }> {
    return fetch(`${this.host}:9000/query/${this.graphname}/${queryName}`, {
      method: 'POST',
      body: params ? JSON.stringify(params) : '{}',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
    }).then(response => {
      if (!response.ok) {
        throw new Error(`Error! status: ${response.status}`)
      }

      return response.json()
    }).then(data => {
      data = data.results

      const links: L[] = []
      const nodes: N[] = []

      for (const res of data) {
        for (const key of data[res]) {
          const vertices = data[res][key]
          for (const vertex of vertices) {
            if (vertices[vertex].v_type === undefined || vertices[vertex].v_id === undefined) break
            const uniqueId = `${vertices[vertex].v_type}_${vertices[vertex].v_id}`
            const customAttributes = { id: uniqueId, v_id: `${vertices[vertex].v_id}`, v_type: `${vertices[vertex].v_type}` }
            nodes.push({ ...(vertices[vertex].attributes), ...customAttributes })
          }
          const edges = data[res][key]
          for (const edge of edges) {
            if (edges[edge].from_type === undefined || edges[edge].to_type === undefined) break
            const customAttributes = { source: `${edges[edge].from_type}_${edges[edge].from_id}`, target: `${edges[edge].to_type}_${edges[edge].to_id}` }
            links.push({ ...(edges[edge].attributes), ...customAttributes })
          }
        }
      }
      if (nodes.length === 0) {
        throw new Error('No vertices detected')
      } else if (links.length === 0) {
        throw new Error('No edges detected')
      }
      return { nodes, links }
    })
  }

  public async runInstalledQuery (queryName: string, params?: Record<string, unknown>): Promise<{ nodes: N[]; links: L[] }> {
    if (this.token === '') {
      return this.generateToken().then(() => this.runQuery(queryName, params))
    } else return this.runQuery(queryName, params)
  }
}
