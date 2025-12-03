export interface WidgetPrompt {
  id: string;
  title: string;
  subtitle: string;
  message: string;
  hiddenContext?: string;
  chatTitle?: string; // Optional custom title for the chat
}

export const widgetPrompts: WidgetPrompt[] = [
  {
    id: "company-overview",
    title: "Company Overview",
    subtitle: "Get insights about a company",
    message: "Company Overview                                                      \n\nBEFORE DOING ANYTHING ELSE, ASK THE USER FOR THE COMPANY NAME, WITHOUT MAKING TOOL CALLS. Once the user provides the company name, call visualize_graph with EXACTLY these arguments: 'cypher_query': 'MATCH (c:Company {name: '<company_name>'})\nOPTIONAL MATCH (c)-[r1:ISSUED_SECURITY]->(s:Security)\nOPTIONAL MATCH (s)-[r2:HAS_PROPERTY]->(p)\nRETURN c, r1, s, r2, p',\n'title': '<company_name> Securities and Properties'. DO NOT MAKE OTHER TOOL CALLS.\n\n",
    chatTitle: "Company Overview",
  },
  {
    id: "fund-overview",
    title: "Funds Overview",
    subtitle: "The overview of all the funds in the database",
    message: "Funds Overview                                                        \n\nCall visualize_graph with EXACTLY these arguments: 'cypher_query': 'MATCH (f1:Fund) RETURN f1',\n'title': 'Funds Overview'. DO NOT MAKE OTHER TOOL CALLS.\n\n",
    chatTitle: "Funds Overview",
  },
  {
    id: "top-5-companies",
    title: "Top 5 Companies",
    subtitle: "Get the top 5 companies in the database",
    message: "Top 5 Companies                                                       \n\nCall visualize_graph with EXACTLY these arguments: 'cypher_query': 'MATCH (c:Company)-[:ISSUED_SECURITY]->(s:Security)-[:HAS_PROPERTY]->(hv:Holdingvalue) WITH c, sum(hv.value) AS total_holding_value ORDER BY total_holding_value DESC LIMIT 5 MATCH (c)-[r1:ISSUED_SECURITY]->(s:Security)-[r2:HAS_PROPERTY]->(hv:Holdingvalue) RETURN c, s, r1, r2, hv',\n'title': 'Top 5 Companies'. Then call cypher_query_executor with EXACTLY these arguments: 'cypher_query': 'MATCH (c:Company)-[:ISSUED_SECURITY]->(s:Security)-[:HAS_PROPERTY]->(hv:Holdingvalue) RETURN c, sum(hv.value) AS total_holding_value ORDER BY total_holding_value DESC LIMIT 5'. DO NOT MAKE OTHER TOOL CALLS.\n\n",
    chatTitle: "Top 5 Companies",
  },
  {
    id: "top-5-partners",
    title: "Top 5 Partners",
    subtitle: "Get the top 5 partners in the database",
    message: "Top 5 Partners                                                       \n\nCall visualize_graph with EXACTLY these arguments: 'cypher_query': 'MATCH (p:Partner)-[:COMMITTED]->(c:Commitment) WITH p, sum(c.commitment_amount) AS total_commitment ORDER BY total_commitment DESC LIMIT 5 MATCH (p)-[r1:COMMITTED]->(c:Commitment) RETURN p, r1, c',\n'title': 'Top 5 Partners'. Then call cypher_query_executor with EXACTLY these arguments: 'cypher_query': 'MATCH (p:Partner)-[:COMMITTED]->(c:Commitment) RETURN p, sum(c.commitment_amount) AS total_commitment ORDER BY total_commitment DESC LIMIT 5'. DO NOT MAKE OTHER TOOL CALLS.\n\n",
    chatTitle: "Top 5 Partners",
  },
];